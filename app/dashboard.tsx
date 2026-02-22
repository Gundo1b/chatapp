import { Ionicons } from '@expo/vector-icons'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../src/lib/supabaseClient'

type TabKey = 'chat' | 'stories' | 'ai' | 'settings'
type SettingsView = 'menu' | 'account'
type StoredProfile = {
  name?: string
  gender?: string
  age?: number | string
  avatar?: string
  pictures?: string[]
}
type SearchProfile = {
  id: string
  name: string
  age: number
  gender: string
  pictures: string[]
}
const PHOTO_BUCKET = 'profile-pictures'
const ACCOUNT_PICTURE_SLOTS = 3

const guessImageExtension = (uri: string) => {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
  const ext = match?.[1]?.toLowerCase()
  if (!ext) return 'jpg'
  if (ext === 'jpeg' || ext === 'jpg' || ext === 'png' || ext === 'webp' || ext === 'heic') return ext
  return 'jpg'
}

const contentTypeForExtension = (ext: string) => {
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'heic':
      return 'image/heic'
    default:
      return 'image/jpeg'
  }
}

const sanitizePathSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'user'

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'chat', label: 'Chat', icon: 'chatbubble-ellipses-outline' },
  { key: 'stories', label: 'Stories', icon: 'book-outline' },
  { key: 'ai', label: 'AI', icon: 'sparkles-outline' },
  { key: 'settings', label: 'Settings', icon: 'settings-outline' },
]

export default function Dashboard() {
  const params = useLocalSearchParams<{ name?: string; gender?: string; age?: string; avatar?: string }>()
  const [activeTab, setActiveTab] = useState<TabKey>('chat')
  const [settingsView, setSettingsView] = useState<SettingsView>('menu')
  const [avatarUri, setAvatarUri] = useState('')
  const [storedProfile, setStoredProfile] = useState<StoredProfile>({})
  const [updatingPictureIndex, setUpdatingPictureIndex] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchingProfiles, setSearchingProfiles] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchProfile[]>([])
  const [searchError, setSearchError] = useState('')
  const [selectedSearchProfile, setSelectedSearchProfile] = useState<SearchProfile | null>(null)
  const [sendingInvite, setSendingInvite] = useState(false)
  const [invitedProfileNames, setInvitedProfileNames] = useState<string[]>([])
  const routeName = typeof params.name === 'string' ? params.name.trim() : ''

  useEffect(() => {
    const routeAvatar = typeof params.avatar === 'string' ? params.avatar : ''
    if (routeAvatar) setAvatarUri(routeAvatar)

    const loadStoredProfile = async () => {
      const stored = await AsyncStorage.getItem('registered_profile')
      if (!stored) return

      try {
        const parsed = JSON.parse(stored) as StoredProfile
        setStoredProfile(parsed)
        if (!routeAvatar && parsed.avatar) setAvatarUri(parsed.avatar)
      } catch {
        // ignore malformed storage
      }
    }

    void loadStoredProfile()
  }, [params.avatar])

  useEffect(() => {
    const syncPicturesFromDb = async () => {
      const hasStoredPictures = Array.isArray(storedProfile.pictures) && storedProfile.pictures.length > 0
      if (hasStoredPictures || !routeName) return

      const { data, error } = await supabase
        .from('profiles')
        .select('name, age, gender, pictures')
        .eq('name', routeName)
        .maybeSingle()

      if (error || !data?.pictures?.length) return

      const merged: StoredProfile = {
        ...storedProfile,
        name: storedProfile.name || data.name || routeName,
        age: storedProfile.age ?? data.age,
        gender: storedProfile.gender || data.gender,
        pictures: data.pictures,
        avatar: storedProfile.avatar || data.pictures[0] || avatarUri,
      }

      setStoredProfile(merged)
      if (!avatarUri && merged.avatar) setAvatarUri(merged.avatar)
      await AsyncStorage.setItem('registered_profile', JSON.stringify(merged))
    }

    void syncPicturesFromDb()
  }, [avatarUri, routeName, storedProfile])

  useEffect(() => {
    const query = searchQuery.trim()
    if (!query) {
      setSearchResults([])
      setSearchError('')
      setSearchingProfiles(false)
      return
    }

    const timeoutId = setTimeout(async () => {
      setSearchingProfiles(true)
      setSearchError('')

      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, age, gender, pictures')
        .ilike('name', `%${query}%`)
        .limit(12)

      if (error) {
        setSearchResults([])
        setSearchError('Could not search right now.')
        setSearchingProfiles(false)
        return
      }

      const currentName = (storedProfile.name || routeName).trim().toLowerCase()
      const cleaned = (data || []).filter((profile) => profile.name.toLowerCase() !== currentName) as SearchProfile[]
      setSearchResults(cleaned)
      setSearchingProfiles(false)
    }, 350)

    return () => clearTimeout(timeoutId)
  }, [routeName, searchQuery, storedProfile.name])

  const onPickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow photo library access.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    })

    if (result.canceled || !result.assets?.[0]?.uri) return

    const nextAvatar = result.assets[0].uri
    setAvatarUri(nextAvatar)

    const stored = await AsyncStorage.getItem('registered_profile')
    if (!stored) return

    try {
      const parsed = JSON.parse(stored) as StoredProfile
      await AsyncStorage.setItem(
        'registered_profile',
        JSON.stringify({
          ...parsed,
          avatar: nextAvatar,
        }),
      )
      setStoredProfile((current) => ({
        ...current,
        ...parsed,
        avatar: nextAvatar,
      }))
    } catch {
      // ignore malformed storage
    }
  }

  const displayName = params.name || storedProfile.name || 'User'
  const displayAge = params.age || (storedProfile.age !== undefined ? String(storedProfile.age) : '-')
  const profilePictures = (storedProfile.pictures || []).filter((picture): picture is string => Boolean(picture))
  const selectedSearchPictures = (selectedSearchProfile?.pictures || []).filter((picture): picture is string => Boolean(picture))
  const profileNameForDb = (storedProfile.name || routeName).trim()
  const accountPictureSlots = Array.from({ length: ACCOUNT_PICTURE_SLOTS }, (_, index) => profilePictures[index] || '')

  const uploadPictureToStorage = async (profileName: string, sourceUri: string, slot: number) => {
    const ext = guessImageExtension(sourceUri)
    const contentType = contentTypeForExtension(ext)
    const objectPath = `${sanitizePathSegment(profileName)}/${Date.now()}-${slot}.${ext}`

    const response = await fetch(sourceUri)
    const blob = await response.blob()

    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(objectPath, blob, {
      contentType,
      upsert: false,
    })

    if (uploadError) {
      throw new Error(uploadError.message)
    }

    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(objectPath)
    return data.publicUrl
  }

  const onEditAccountPicture = async (slot: number) => {
    if (!profileNameForDb) {
      Alert.alert('Missing profile', 'Please register or sign in again.')
      return
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow photo library access.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 5],
    })

    if (result.canceled || !result.assets?.[0]?.uri) return

    setUpdatingPictureIndex(slot)
    try {
      const { data: row, error: rowError } = await supabase
        .from('profiles')
        .select('pictures')
        .eq('name', profileNameForDb)
        .maybeSingle()

      if (rowError) {
        throw new Error(rowError.message)
      }

      const basePictures = (row?.pictures || profilePictures).filter((picture): picture is string => Boolean(picture))
      if (basePictures.length !== ACCOUNT_PICTURE_SLOTS) {
        throw new Error('Your profile must contain exactly 3 pictures before editing.')
      }

      const uploadedUrl = await uploadPictureToStorage(profileNameForDb, result.assets[0].uri, slot)
      const nextPictures = [...basePictures]
      nextPictures[slot] = uploadedUrl

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ pictures: nextPictures })
        .eq('name', profileNameForDb)

      if (updateError) {
        throw new Error(updateError.message)
      }

      const nextAvatar = slot === 0 ? uploadedUrl : avatarUri || nextPictures[0]
      setStoredProfile((current) => ({
        ...current,
        pictures: nextPictures,
        avatar: nextAvatar,
      }))
      if (slot === 0) setAvatarUri(uploadedUrl)

      const stored = await AsyncStorage.getItem('registered_profile')
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as StoredProfile
          await AsyncStorage.setItem(
            'registered_profile',
            JSON.stringify({
              ...parsed,
              pictures: nextPictures,
              avatar: nextAvatar,
            }),
          )
        } catch {
          // ignore malformed storage
        }
      }

      Alert.alert('Saved', 'Picture updated successfully.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update picture.'
      Alert.alert('Update failed', message)
    } finally {
      setUpdatingPictureIndex(null)
    }
  }

  const onInviteProfile = async () => {
    if (!selectedSearchProfile) return
    const senderName = profileNameForDb
    const receiverName = selectedSearchProfile.name.trim()
    const receiverKey = receiverName.toLowerCase()

    if (!senderName || !receiverName) {
      Alert.alert('Missing profile', 'Could not send request right now.')
      return
    }

    if (senderName.toLowerCase() === receiverName.toLowerCase()) {
      Alert.alert('Invalid action', 'You cannot invite yourself.')
      return
    }

    setSendingInvite(true)
    const { error } = await supabase.from('friend_requests').upsert(
      {
        sender_name: senderName,
        receiver_name: receiverName,
        status: 'pending',
      },
      { onConflict: 'sender_name,receiver_name' },
    )
    setSendingInvite(false)

    if (error) {
      Alert.alert('Invite failed', error.message)
      return
    }

    setInvitedProfileNames((current) => (current.includes(receiverKey) ? current : [...current, receiverKey]))
    Alert.alert('Invite sent', `Friend request sent to ${receiverName}.`)
  }

  const selectedProfileIsInvited = selectedSearchProfile
    ? invitedProfileNames.includes(selectedSearchProfile.name.trim().toLowerCase())
    : false

  const tabContentTitle = useMemo(() => {
    switch (activeTab) {
      case 'chat':
        return 'Messages'
      case 'stories':
        return 'Stories'
      case 'ai':
        return 'AI Assistant'
      case 'settings':
        return 'Settings'
      default:
        return ''
    }
  }, [activeTab])

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Pressable style={styles.avatarWrap} onPress={onPickAvatar}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={18} color="#FFFFFF" />
            )}
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>Hey, {displayName}</Text>
            <Text style={styles.subtitle}>Ready to chat?</Text>
          </View>
          <Pressable style={styles.headerAction}>
            <Ionicons name="notifications-outline" size={20} color="#1E1E1E" />
          </Pressable>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search people"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {searchQuery.trim() ? (
          <View style={styles.searchResultsCard}>
            {searchingProfiles ? (
              <View style={styles.searchStatusRow}>
                <ActivityIndicator size="small" color="#FF5864" />
                <Text style={styles.searchStatusText}>Searching...</Text>
              </View>
            ) : null}

            {!searchingProfiles && searchError ? <Text style={styles.searchErrorText}>{searchError}</Text> : null}

            {!searchingProfiles && !searchError && searchResults.length === 0 ? (
              <Text style={styles.searchStatusText}>No people found.</Text>
            ) : null}

            {!searchingProfiles && !searchError && searchResults.length > 0
              ? searchResults.map((person) => (
                  <Pressable
                    key={person.id}
                    style={styles.searchResultItem}
                    onPress={() => {
                      setSelectedSearchProfile(person)
                      setSearchQuery('')
                      setSearchResults([])
                    }}
                  >
                    <View style={styles.searchResultAvatar}>
                      {person.pictures?.[0] ? (
                        <Image source={{ uri: person.pictures[0] }} style={styles.searchResultAvatarImage} />
                      ) : (
                        <Ionicons name="person-outline" size={16} color="#FF5864" />
                      )}
                    </View>
                    <View style={styles.searchResultMain}>
                      <Text style={styles.searchResultName}>{person.name}</Text>
                      <Text style={styles.searchResultMeta}>
                        {person.gender} | {person.age}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                  </Pressable>
                ))
              : null}
          </View>
        ) : null}

        <View style={styles.contentHeader}>
          <Text style={styles.contentTitle}>{tabContentTitle}</Text>
        </View>

        <View style={styles.contentPanel}>
          {activeTab === 'chat' ? (
            selectedSearchProfile ? (
              <View style={styles.searchProfileCard}>
                <View style={styles.searchProfileHeader}>
                  <Pressable style={styles.accountBack} onPress={() => setSelectedSearchProfile(null)}>
                    <Ionicons name="chevron-back" size={16} color="#6B7280" />
                    <Text style={styles.accountBackText}>Back</Text>
                  </Pressable>
                  <Text style={styles.accountTitle}>Profile</Text>
                </View>

                <View style={styles.searchProfileIdentity}>
                  <View style={styles.searchProfileAvatar}>
                    {selectedSearchPictures[0] ? (
                      <Image source={{ uri: selectedSearchPictures[0] }} style={styles.searchProfileAvatarImage} />
                    ) : (
                      <Ionicons name="person-outline" size={26} color="#FF5864" />
                    )}
                  </View>
                  <View style={styles.searchProfileTextWrap}>
                    <Text style={styles.searchProfileName}>{selectedSearchProfile.name}</Text>
                    <Text style={styles.searchProfileMeta}>
                      {selectedSearchProfile.gender} | {selectedSearchProfile.age}
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={[
                    styles.inviteButton,
                    sendingInvite || selectedProfileIsInvited ? styles.inviteButtonDisabled : null,
                  ]}
                  onPress={() => void onInviteProfile()}
                  disabled={sendingInvite || selectedProfileIsInvited}
                >
                  <View style={styles.inviteButtonContent}>
                    {selectedProfileIsInvited ? (
                      <Ionicons name="checkmark-circle" size={15} color="#FFFFFF" />
                    ) : null}
                    <Text style={styles.inviteButtonText}>
                      {sendingInvite
                        ? 'Sending...'
                        : selectedProfileIsInvited
                          ? 'Request Sent'
                          : 'Invite'}
                    </Text>
                  </View>
                </Pressable>

                {selectedSearchPictures.length > 0 ? (
                  <View style={styles.picturesGrid}>
                    {selectedSearchPictures.map((uri, index) => (
                      <View key={`${uri}-${index}`} style={styles.pictureTile}>
                        <Image source={{ uri }} style={styles.pictureImage} />
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.accountEmptyText}>No pictures uploaded for this profile.</Text>
                )}
              </View>
            ) : (
              <>
              <View style={styles.storiesEmpty}>
                <Ionicons name="book-outline" size={18} color="#9CA3AF" />
                <Text style={styles.storiesEmptyTitle}>No stories yet</Text>
                <Text style={styles.storiesEmptyText}>Stories from matches will appear here.</Text>
              </View>

              <View style={styles.chatEmpty}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#9CA3AF" />
                <Text style={styles.chatEmptyTitle}>No chats yet</Text>
                <Text style={styles.chatEmptyText}>When you match with someone, messages will show here.</Text>
              </View>
              </>
            )
          ) : null}

          {activeTab === 'stories' ? (
            <View style={styles.placeholderCard}>
              <Ionicons name="book-outline" size={20} color="#FF5864" />
              <Text style={styles.placeholderTitle}>Stories Feed</Text>
              <Text style={styles.placeholderText}>Create and browse short updates from your matches.</Text>
            </View>
          ) : null}

          {activeTab === 'ai' ? (
            <View style={styles.placeholderCard}>
              <Ionicons name="sparkles-outline" size={20} color="#FF5864" />
              <Text style={styles.placeholderTitle}>AI Wingman</Text>
              <Text style={styles.placeholderText}>Generate openers, rewrite messages, and improve your profile bio.</Text>
            </View>
          ) : null}

          {activeTab === 'settings' ? (
            settingsView === 'menu' ? (
              <View style={styles.settingsList}>
                <Pressable style={styles.settingsItem} onPress={() => setSettingsView('account')}>
                  <Text style={styles.settingsText}>Account</Text>
                  <Ionicons name="chevron-forward" size={16} color="#6B7280" />
                </Pressable>
                {['Notifications', 'Privacy', 'Blocked Users'].map((item) => (
                  <Pressable key={item} style={styles.settingsItem}>
                    <Text style={styles.settingsText}>{item}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#6B7280" />
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.accountCard}>
                <View style={styles.accountHeader}>
                  <Pressable style={styles.accountBack} onPress={() => setSettingsView('menu')}>
                    <Ionicons name="chevron-back" size={16} color="#6B7280" />
                    <Text style={styles.accountBackText}>Back</Text>
                  </Pressable>
                  <Text style={styles.accountTitle}>Account</Text>
                </View>

                <View style={styles.accountInfo}>
                  <Text style={styles.accountLine}>Name: {displayName}</Text>
                  <Text style={styles.accountLine}>Age: {displayAge}</Text>
                </View>

                <Text style={styles.accountHint}>Tap a photo slot to replace it.</Text>
                <View style={styles.picturesGrid}>
                  {accountPictureSlots.map((uri, index) => (
                    <Pressable
                      key={`slot-${index}`}
                      style={styles.pictureTile}
                      onPress={() => void onEditAccountPicture(index)}
                      disabled={updatingPictureIndex !== null}
                    >
                      {uri ? (
                        <Image source={{ uri }} style={styles.pictureImage} />
                      ) : (
                        <View style={styles.picturePlaceholder}>
                          <Ionicons name="add" size={20} color="#9CA3AF" />
                          <Text style={styles.picturePlaceholderText}>Add</Text>
                        </View>
                      )}
                      {updatingPictureIndex === index ? (
                        <View style={styles.pictureUpdatingOverlay}>
                          <Text style={styles.pictureUpdatingText}>Saving...</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
                {profilePictures.length === 0 ? <Text style={styles.accountEmptyText}>No uploaded pictures found.</Text> : null}
              </View>
            )
          ) : null}
        </View>

        <View style={styles.tabRow}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <Pressable
                key={tab.key}
                style={styles.tabButton}
                onPress={() => {
                  setActiveTab(tab.key)
                  if (tab.key !== 'settings') setSettingsView('menu')
                  if (tab.key !== 'chat') setSelectedSearchProfile(null)
                }}
              >
                <Ionicons name={tab.icon} size={18} color={isActive ? '#FF5864' : '#9CA3AF'} />
                <Text style={[styles.tabText, isActive ? styles.tabTextActive : null]}>{tab.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    padding: 14,
  },
  card: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF5864',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E1E1E',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
    paddingVertical: 0,
  },
  searchResultsCard: {
    marginTop: -4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  searchStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchStatusText: {
    fontSize: 13,
    color: '#6B7280',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchErrorText: {
    fontSize: 13,
    color: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  searchResultAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFF1F3',
    borderWidth: 1,
    borderColor: '#FFD2D8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 10,
  },
  searchResultAvatarImage: {
    width: '100%',
    height: '100%',
  },
  searchResultMain: {
    flex: 1,
    gap: 2,
  },
  searchResultName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  searchResultMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  contentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  contentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  contentPanel: {
    flex: 1,
  },
  searchProfileCard: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 12,
  },
  searchProfileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchProfileIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchProfileAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: '#FFD2D8',
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  searchProfileAvatarImage: {
    width: '100%',
    height: '100%',
  },
  searchProfileTextWrap: {
    gap: 3,
  },
  searchProfileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  searchProfileMeta: {
    fontSize: 13,
    color: '#6B7280',
  },
  inviteButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FF5864',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  inviteButtonDisabled: {
    backgroundColor: '#FCA5A5',
  },
  inviteButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  inviteButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storiesEmpty: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 14,
    backgroundColor: '#FAFAFC',
    padding: 14,
    gap: 8,
  },
  storiesEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  storiesEmptyText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  chatEmpty: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 14,
    backgroundColor: '#FAFAFC',
    padding: 14,
    gap: 8,
  },
  chatEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  chatEmptyText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  placeholderCard: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 14,
    padding: 14,
    gap: 8,
    backgroundColor: '#FAFAFC',
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  placeholderText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  settingsList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 14,
    overflow: 'hidden',
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  settingsText: {
    fontSize: 14,
    color: '#111827',
  },
  accountCard: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accountBackText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  accountTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  accountInfo: {
    gap: 4,
  },
  accountLine: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  accountHint: {
    fontSize: 13,
    color: '#6B7280',
  },
  picturesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pictureTile: {
    width: 92,
    height: 120,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  pictureImage: {
    width: '100%',
    height: '100%',
  },
  picturePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
  },
  picturePlaceholderText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  pictureUpdatingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pictureUpdatingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  accountEmptyText: {
    fontSize: 13,
    color: '#6B7280',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  tabTextActive: {
    color: '#FF5864',
  },
  tabRow: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
