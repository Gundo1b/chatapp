import { Ionicons } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
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
type IncomingInvite = {
  id: string
  sender_name: string
  receiver_name: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  sender_profile?: SearchProfile | null
}
type ChatMessage = {
  id: string
  text: string
  sender_name: string
  created_at: string
}
type ChatMessageRow = {
  id: string
  sender_name: string
  receiver_name: string
  message_text: string
  created_at: string
  read_at?: string | null
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
  const [friendProfileNames, setFriendProfileNames] = useState<string[]>([])
  const [friendProfiles, setFriendProfiles] = useState<SearchProfile[]>([])
  const [pendingInviteCount, setPendingInviteCount] = useState(0)
  const [showInvitesPanel, setShowInvitesPanel] = useState(false)
  const [incomingInvites, setIncomingInvites] = useState<IncomingInvite[]>([])
  const [loadingIncomingInvites, setLoadingIncomingInvites] = useState(false)
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null)
  const [zoomImageUri, setZoomImageUri] = useState('')
  const [activeChatFriend, setActiveChatFriend] = useState<SearchProfile | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [loadingChatMessages, setLoadingChatMessages] = useState(false)
  const [sendingChatMessage, setSendingChatMessage] = useState(false)
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [unreadByFriend, setUnreadByFriend] = useState<Record<string, number>>({})
  const [friendSearchQuery, setFriendSearchQuery] = useState('')
  const routeName = typeof params.name === 'string' ? params.name.trim() : ''
  const currentProfileName = (storedProfile.name || routeName).trim()

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
    if (!currentProfileName) {
      setPendingInviteCount(0)
      return
    }

    let isActive = true
    let timer: ReturnType<typeof setInterval> | null = null

    const loadPendingInvites = async () => {
      const { count, error } = await supabase
        .from('friend_requests')
        .select('id', { count: 'exact', head: true })
        .ilike('receiver_name', currentProfileName)
        .eq('status', 'pending')

      if (!isActive || error) return
      setPendingInviteCount(count ?? 0)
    }

    void loadPendingInvites()
    timer = setInterval(() => {
      void loadPendingInvites()
    }, 12000)

    return () => {
      isActive = false
      if (timer) clearInterval(timer)
    }
  }, [currentProfileName])

  const loadIncomingInvites = async () => {
    if (!currentProfileName) {
      setIncomingInvites([])
      setPendingInviteCount(0)
      return
    }

    setLoadingIncomingInvites(true)
    const { data, error } = await supabase
      .from('friend_requests')
      .select('id, sender_name, receiver_name, status, created_at')
      .ilike('receiver_name', currentProfileName)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setLoadingIncomingInvites(false)

    if (error) {
      Alert.alert('Invites unavailable', error.message)
      return
    }

    const requestRows = (data || []) as IncomingInvite[]
    const senderNames = Array.from(new Set(requestRows.map((row) => row.sender_name?.trim()).filter(Boolean)))

    const senderProfilesByName = new Map<string, SearchProfile>()
    if (senderNames.length > 0) {
      const results = await Promise.all(
        senderNames.map(async (senderName) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, name, age, gender, pictures')
            .ilike('name', senderName)
            .maybeSingle()
          return profile as SearchProfile | null
        }),
      )

      results.forEach((profile) => {
        if (!profile?.name) return
        senderProfilesByName.set(profile.name.trim().toLowerCase(), profile)
      })
    }

    const rows = requestRows.map((row) => ({
      ...row,
      sender_profile: senderProfilesByName.get(row.sender_name.trim().toLowerCase()) || null,
    }))
    setIncomingInvites(rows)
    setPendingInviteCount(rows.length)
  }

  useEffect(() => {
    if (!currentProfileName) {
      setInvitedProfileNames([])
      return
    }

    let isActive = true
    let timer: ReturnType<typeof setInterval> | null = null

    const loadSentInvites = async () => {
      const { data, error } = await supabase
        .from('friend_requests')
        .select('receiver_name')
        .ilike('sender_name', currentProfileName)
        .eq('status', 'pending')

      if (!isActive || error) return

      const nextInvitedNames = (data || [])
        .map((row) => row.receiver_name?.trim().toLowerCase())
        .filter((name): name is string => Boolean(name))

      setInvitedProfileNames(nextInvitedNames)
    }

    void loadSentInvites()
    timer = setInterval(() => {
      void loadSentInvites()
    }, 12000)

    return () => {
      isActive = false
      if (timer) clearInterval(timer)
    }
  }, [currentProfileName])

  useEffect(() => {
    if (!currentProfileName) {
      setFriendProfileNames([])
      return
    }

    let isActive = true
    let timer: ReturnType<typeof setInterval> | null = null

    const loadFriends = async () => {
      const [sentAccepted, receivedAccepted] = await Promise.all([
        supabase
          .from('friend_requests')
          .select('receiver_name')
          .ilike('sender_name', currentProfileName)
          .eq('status', 'accepted'),
        supabase
          .from('friend_requests')
          .select('sender_name')
          .ilike('receiver_name', currentProfileName)
          .eq('status', 'accepted'),
      ])

      if (!isActive || sentAccepted.error || receivedAccepted.error) return

      const sentNames = (sentAccepted.data || [])
        .map((row) => row.receiver_name?.trim().toLowerCase())
        .filter((name): name is string => Boolean(name))
      const receivedNames = (receivedAccepted.data || [])
        .map((row) => row.sender_name?.trim().toLowerCase())
        .filter((name): name is string => Boolean(name))

      setFriendProfileNames(Array.from(new Set([...sentNames, ...receivedNames])))
    }

    void loadFriends()
    timer = setInterval(() => {
      void loadFriends()
    }, 12000)

    return () => {
      isActive = false
      if (timer) clearInterval(timer)
    }
  }, [currentProfileName])

  useEffect(() => {
    if (friendProfileNames.length === 0) {
      setFriendProfiles([])
      return
    }

    let isActive = true

    const loadFriendProfiles = async () => {
      const results = await Promise.all(
        friendProfileNames.map(async (friendName) => {
          const { data } = await supabase
            .from('profiles')
            .select('id, name, age, gender, pictures')
            .ilike('name', friendName)
            .maybeSingle()
          return data as SearchProfile | null
        }),
      )

      if (!isActive) return

      const deduped = Array.from(
        new Map(
          results
            .filter((profile): profile is SearchProfile => Boolean(profile?.id))
            .map((profile) => [profile.id, profile]),
        ).values(),
      ).sort((a, b) => a.name.localeCompare(b.name))

      setFriendProfiles(deduped)
    }

    void loadFriendProfiles()

    return () => {
      isActive = false
    }
  }, [friendProfileNames])

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
  const filteredFriendProfiles = friendProfiles.filter((friend) =>
    friend.name.toLowerCase().includes(friendSearchQuery.trim().toLowerCase()),
  )
  const profileNameForDb = currentProfileName
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

    if (friendProfileNames.includes(receiverKey)) {
      Alert.alert('Already friends', 'You are already connected with this profile.')
      return
    }

    setSendingInvite(true)
    try {
      const { error } = await supabase.from('friend_requests').upsert(
        {
          sender_name: senderName,
          receiver_name: receiverName,
          status: 'pending',
        },
        { onConflict: 'sender_name,receiver_name' },
      )

      if (error) {
        Alert.alert('Invite failed', error.message)
        return
      }

      setInvitedProfileNames((current) => (current.includes(receiverKey) ? current : [...current, receiverKey]))
      Alert.alert('Invite sent', `Friend request sent to ${receiverName}.`)
    } catch {
      Alert.alert('Invite failed', 'Could not send invite right now.')
    } finally {
      setSendingInvite(false)
    }
  }

  const selectedProfileIsInvited = selectedSearchProfile
    ? invitedProfileNames.includes(selectedSearchProfile.name.trim().toLowerCase())
    : false
  const selectedProfileIsFriend = selectedSearchProfile
    ? friendProfileNames.includes(selectedSearchProfile.name.trim().toLowerCase())
    : false

  const onOpenInvites = async () => {
    setShowInvitesPanel(true)
    setActiveTab('chat')
    setSelectedSearchProfile(null)
    await loadIncomingInvites()
  }

  const openFriendChat = (friend: SearchProfile) => {
    const friendKey = friend.name.trim().toLowerCase()
    const unreadForFriend = unreadByFriend[friendKey] || 0

    if (unreadForFriend > 0) {
      setUnreadByFriend((current) => {
        const next = { ...current }
        delete next[friendKey]
        return next
      })
      setUnreadChatCount((current) => Math.max(0, current - unreadForFriend))
    }

    setShowInvitesPanel(false)
    setSelectedSearchProfile(null)
    setActiveTab('chat')
    setActiveChatFriend(friend)
    void supabase
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .ilike('receiver_name', currentProfileName.trim())
      .ilike('sender_name', friend.name.trim())
      .is('read_at', null)
  }

  const activeFriendUnreadCount = activeChatFriend
    ? unreadByFriend[activeChatFriend.name.trim().toLowerCase()] || 0
    : 0
  const visibleUnreadChatCount = Math.max(0, unreadChatCount - activeFriendUnreadCount)

  const onRespondToInvite = async (inviteId: string, nextStatus: 'accepted' | 'rejected') => {
    setProcessingInviteId(inviteId)
    try {
      const matchedInvite = incomingInvites.find((invite) => invite.id === inviteId)
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: nextStatus })
        .eq('id', inviteId)

      if (error) {
        Alert.alert('Update failed', error.message)
        return
      }

      setIncomingInvites((current) => current.filter((invite) => invite.id !== inviteId))
      setPendingInviteCount((count) => Math.max(0, count - 1))

      if (nextStatus === 'accepted') {
        if (matchedInvite?.sender_name) {
          const friendKey = matchedInvite.sender_name.trim().toLowerCase()
          setFriendProfileNames((current) => (current.includes(friendKey) ? current : [...current, friendKey]))
        }
        if (matchedInvite?.sender_profile) {
          openFriendChat(matchedInvite.sender_profile)
        } else {
          setShowInvitesPanel(false)
          setActiveTab('chat')
          setSelectedSearchProfile(null)
        }
      }
    } catch {
      Alert.alert('Update failed', 'Could not update invite right now.')
    } finally {
      setProcessingInviteId(null)
    }
  }

  const openZoom = (uri: string) => {
    if (!uri) return
    setZoomImageUri(uri)
  }

  const activeChatIsFriend = activeChatFriend
    ? friendProfileNames.includes(activeChatFriend.name.trim().toLowerCase())
    : false

  const refreshUnreadCounts = useCallback(async () => {
    if (!currentProfileName) {
      setUnreadChatCount(0)
      setUnreadByFriend({})
      return
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .select('sender_name')
      .ilike('receiver_name', currentProfileName)
      .is('read_at', null)

    if (error) return

    const rows = data || []
    const nextByFriend: Record<string, number> = {}
    rows.forEach((row) => {
      const key = row.sender_name?.trim().toLowerCase()
      if (!key) return
      nextByFriend[key] = (nextByFriend[key] || 0) + 1
    })

    setUnreadByFriend(nextByFriend)
    setUnreadChatCount(rows.length)
  }, [currentProfileName])

  useEffect(() => {
    const loadConversation = async (showLoader: boolean) => {
      if (!activeChatFriend?.name) {
        setChatMessages([])
        return
      }

      const currentName = currentProfileName.trim()
      const friendName = activeChatFriend.name.trim()
      if (!currentName || !friendName) {
        setChatMessages([])
        return
      }

      if (showLoader) setLoadingChatMessages(true)
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, sender_name, receiver_name, message_text, created_at')
        .or(
          `and(sender_name.ilike.${currentName},receiver_name.ilike.${friendName}),and(sender_name.ilike.${friendName},receiver_name.ilike.${currentName})`,
        )
        .order('created_at', { ascending: true })
      if (showLoader) setLoadingChatMessages(false)

      if (error) {
        if (showLoader) Alert.alert('Chat unavailable', error.message)
        return
      }

      const mapped = ((data || []) as ChatMessageRow[]).map((row) => ({
        id: row.id,
        sender_name: row.sender_name,
        text: row.message_text,
        created_at: row.created_at,
      }))
      setChatMessages(mapped)

      await supabase
        .from('chat_messages')
        .update({ read_at: new Date().toISOString() })
        .ilike('receiver_name', currentName)
        .ilike('sender_name', friendName)
        .is('read_at', null)

      await refreshUnreadCounts()
    }

    let isActive = true
    let timer: ReturnType<typeof setInterval> | null = null

    const bootstrap = async () => {
      if (!isActive) return
      await loadConversation(true)
    }

    void bootstrap()
    timer = setInterval(() => {
      if (!isActive) return
      void loadConversation(false)
    }, 3500)

    return () => {
      isActive = false
      if (timer) clearInterval(timer)
    }
  }, [activeChatFriend?.name, currentProfileName, refreshUnreadCounts])

  useEffect(() => {
    if (!currentProfileName) {
      setUnreadChatCount(0)
      return
    }

    let timer: ReturnType<typeof setInterval> | null = null

    const loadUnreadCount = async () => {
      await refreshUnreadCounts()
    }

    void loadUnreadCount()
    timer = setInterval(() => {
      void loadUnreadCount()
    }, 4500)

    return () => {
      if (timer) clearInterval(timer)
    }
  }, [currentProfileName, refreshUnreadCounts])

  const onSendChatMessage = async () => {
    const trimmed = chatDraft.trim()
    if (!trimmed || !activeChatFriend?.name || !currentProfileName) return
    if (!activeChatIsFriend) {
      Alert.alert('Not allowed', 'Only accepted friends can send messages.')
      return
    }

    setSendingChatMessage(true)
    const senderName = currentProfileName.trim()
    const receiverName = activeChatFriend.name.trim()
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        sender_name: senderName,
        receiver_name: receiverName,
        message_text: trimmed,
      })
      .select('id, sender_name, receiver_name, message_text, created_at')
      .single()
    setSendingChatMessage(false)

    if (error) {
      Alert.alert('Send failed', error.message)
      return
    }

    const inserted = data as ChatMessageRow
    setChatMessages((current) => [
      ...current,
      {
        id: inserted.id,
        sender_name: inserted.sender_name,
        text: inserted.message_text,
        created_at: inserted.created_at,
      },
    ])
    setChatDraft('')
  }

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
        {activeTab !== 'chat' ? (
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
            <Pressable style={styles.headerAction} onPress={() => void onOpenInvites()}>
              <Ionicons name="notifications-outline" size={20} color="#1E1E1E" />
              {pendingInviteCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{pendingInviteCount > 99 ? '99+' : pendingInviteCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        ) : null}

        {activeTab !== 'chat' ? (
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
        ) : null}

        {activeTab === 'chat' && !showInvitesPanel && !activeChatFriend ? (
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color="#6B7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search friends"
              placeholderTextColor="#9CA3AF"
              value={friendSearchQuery}
              onChangeText={setFriendSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        ) : null}

        {activeTab !== 'chat' && searchQuery.trim() ? (
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
          {showInvitesPanel ? (
            <View style={styles.invitesCard}>
              <View style={styles.invitesHeader}>
                <Text style={styles.invitesTitle}>Invites</Text>
                <Pressable onPress={() => setShowInvitesPanel(false)}>
                  <Text style={styles.invitesClose}>Close</Text>
                </Pressable>
              </View>

              {loadingIncomingInvites ? (
                <View style={styles.searchStatusRow}>
                  <ActivityIndicator size="small" color="#FF5864" />
                  <Text style={styles.searchStatusText}>Loading invites...</Text>
                </View>
              ) : null}

              {!loadingIncomingInvites && incomingInvites.length === 0 ? (
                <Text style={styles.searchStatusText}>No pending invites.</Text>
              ) : null}

              {!loadingIncomingInvites && incomingInvites.length > 0
                ? incomingInvites.map((invite) => (
                    <View key={invite.id} style={styles.inviteRow}>
                      <View style={styles.inviteTopRow}>
                        <View style={styles.inviteAvatarWrap}>
                          {invite.sender_profile?.pictures?.[0] ? (
                            <Image source={{ uri: invite.sender_profile.pictures[0] }} style={styles.inviteAvatarImage} />
                          ) : (
                            <Ionicons name="person-outline" size={16} color="#FF5864" />
                          )}
                        </View>
                        <View style={styles.inviteTextWrap}>
                          <Text style={styles.inviteName}>{invite.sender_name}</Text>
                          <Text style={styles.inviteMeta}>
                            {invite.sender_profile?.gender || '-'} | {invite.sender_profile?.age ?? '-'}
                          </Text>
                        </View>
                      </View>

                      {invite.sender_profile?.pictures?.length ? (
                        <View style={styles.invitePicturesRow}>
                          {invite.sender_profile.pictures.slice(0, 3).map((uri, index) => (
                            <Pressable key={`${invite.id}-${uri}-${index}`} style={styles.invitePictureTile} onPress={() => openZoom(uri)}>
                              <Image source={{ uri }} style={styles.invitePictureImage} />
                            </Pressable>
                          ))}
                        </View>
                      ) : null}

                      <View style={styles.inviteActions}>
                        <Pressable
                          style={styles.inviteAcceptButton}
                          onPress={() => void onRespondToInvite(invite.id, 'accepted')}
                          disabled={processingInviteId === invite.id}
                        >
                          <Text style={styles.inviteAcceptButtonText}>
                            {processingInviteId === invite.id ? 'Saving...' : 'Accept'}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.inviteDeclineButton}
                          onPress={() => void onRespondToInvite(invite.id, 'rejected')}
                          disabled={processingInviteId === invite.id}
                        >
                          <Text style={styles.inviteDeclineButtonText}>Decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                : null}
            </View>
          ) : null}

          {activeTab === 'chat' ? (
            showInvitesPanel ? null : activeChatFriend ? (
              <View style={[styles.searchProfileCard, styles.chatConversationCard]}>
                <View style={styles.searchProfileHeader}>
                  <Pressable style={styles.accountBack} onPress={() => setActiveChatFriend(null)}>
                    <Ionicons name="chevron-back" size={16} color="#6B7280" />
                    <Text style={styles.accountBackText}>Back</Text>
                  </Pressable>
                  <Text style={styles.accountTitle}>Chat</Text>
                </View>

                <View style={styles.searchProfileIdentity}>
                  <View style={styles.searchProfileAvatar}>
                    {activeChatFriend.pictures?.[0] ? (
                      <Image source={{ uri: activeChatFriend.pictures[0] }} style={styles.searchProfileAvatarImage} />
                    ) : (
                      <Ionicons name="person-outline" size={26} color="#FF5864" />
                    )}
                  </View>
                  <View style={styles.searchProfileTextWrap}>
                    <Text style={styles.searchProfileName}>{activeChatFriend.name}</Text>
                    <Text style={styles.searchProfileMeta}>
                      {activeChatFriend.gender} | {activeChatFriend.age}
                    </Text>
                  </View>
                </View>

                <View style={styles.messagesWrap}>
                  {loadingChatMessages ? (
                    <Text style={styles.chatHintText}>Loading messages...</Text>
                  ) : chatMessages.length === 0 ? (
                    <Text style={styles.chatHintText}>Start the conversation.</Text>
                  ) : (
                    chatMessages.map((message) => {
                      const isMine = message.sender_name.trim().toLowerCase() === currentProfileName.trim().toLowerCase()
                      return (
                        <View key={message.id} style={[styles.messageBubble, isMine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                          <Text style={[styles.messageText, isMine ? styles.messageTextMine : null]}>{message.text}</Text>
                        </View>
                      )
                    })
                  )}
                </View>

                <View style={styles.chatComposer}>
                  <TextInput
                    style={styles.chatInput}
                    placeholder="Type a message"
                    placeholderTextColor="#9CA3AF"
                    value={chatDraft}
                    onChangeText={setChatDraft}
                  />
                  <Pressable
                    style={[styles.chatSendButton, sendingChatMessage ? styles.inviteButtonDisabled : null]}
                    onPress={() => void onSendChatMessage()}
                    disabled={sendingChatMessage}
                  >
                    <Text style={styles.chatSendButtonText}>{sendingChatMessage ? 'Sending...' : 'Send'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : selectedSearchProfile ? (
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

                {selectedProfileIsFriend ? (
                  <View style={styles.friendPill}>
                    <Ionicons name="checkmark-circle" size={15} color="#FFFFFF" />
                    <Text style={styles.friendPillText}>Friends</Text>
                  </View>
                ) : (
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
                )}

                {selectedSearchPictures.length > 0 ? (
                  <View style={styles.picturesGrid}>
                    {selectedSearchPictures.map((uri, index) => (
                      <Pressable key={`${uri}-${index}`} style={styles.pictureTile} onPress={() => openZoom(uri)}>
                        <Image source={{ uri }} style={styles.pictureImage} />
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.accountEmptyText}>No pictures uploaded for this profile.</Text>
                )}
              </View>
            ) : (
              <>
              {friendProfiles.length > 0 ? (
                <View style={styles.friendsCard}>
                  <Text style={styles.friendsTitle}>Friends</Text>
                  {filteredFriendProfiles.map((friend) => (
                    (() => {
                      const unreadForFriend = unreadByFriend[friend.name.trim().toLowerCase()] || 0
                      return (
                        <Pressable
                          key={friend.id}
                          style={styles.friendRow}
                          onPress={() => openFriendChat(friend)}
                        >
                          <View style={styles.friendAvatarWrap}>
                            {friend.pictures?.[0] ? (
                              <Image source={{ uri: friend.pictures[0] }} style={styles.friendAvatarImage} />
                            ) : (
                              <Ionicons name="person-outline" size={16} color="#FF5864" />
                            )}
                          </View>
                          <View style={styles.friendMain}>
                            <Text style={styles.friendName}>{friend.name}</Text>
                            <Text style={styles.friendMeta}>
                              {friend.gender} | {friend.age}
                            </Text>
                          </View>
                          {unreadForFriend > 0 ? (
                            <View style={styles.friendUnreadBadge}>
                              <Text style={styles.friendUnreadBadgeText}>{unreadForFriend > 99 ? '99+' : unreadForFriend}</Text>
                            </View>
                          ) : null}
                          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                        </Pressable>
                      )
                    })()
                  ))}
                  {filteredFriendProfiles.length === 0 ? (
                    <Text style={styles.searchStatusText}>No friends found.</Text>
                  ) : null}
                </View>
              ) : (
                <View style={styles.storiesEmpty}>
                  <Ionicons name="people-outline" size={18} color="#9CA3AF" />
                  <Text style={styles.storiesEmptyTitle}>No friends yet</Text>
                  <Text style={styles.storiesEmptyText}>Accept invites to build your friends list.</Text>
                </View>
              )}

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
                {tab.key === 'chat' && visibleUnreadChatCount > 0 ? (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{visibleUnreadChatCount > 99 ? '99+' : visibleUnreadChatCount}</Text>
                  </View>
                ) : null}
                <Text style={[styles.tabText, isActive ? styles.tabTextActive : null]}>{tab.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <Modal visible={Boolean(zoomImageUri)} transparent animationType="fade" onRequestClose={() => setZoomImageUri('')}>
        <View style={styles.zoomBackdrop}>
          <Pressable style={styles.zoomBackdropPress} onPress={() => setZoomImageUri('')} />
          <View style={styles.zoomCard}>
            {zoomImageUri ? <Image source={{ uri: zoomImageUri }} style={styles.zoomImage} resizeMode="contain" /> : null}
            <Pressable style={styles.zoomCloseButton} onPress={() => setZoomImageUri('')}>
              <Text style={styles.zoomCloseButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF5864',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
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
  chatConversationCard: {
    flex: 1,
    minHeight: 0,
  },
  invitesCard: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10,
    marginBottom: 10,
  },
  invitesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  invitesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  invitesClose: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  inviteRow: {
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  inviteTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inviteAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF1F3',
    borderWidth: 1,
    borderColor: '#FFD2D8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inviteAvatarImage: {
    width: '100%',
    height: '100%',
  },
  inviteTextWrap: {
    flex: 1,
    gap: 2,
  },
  inviteName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  inviteMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  inviteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'flex-end',
  },
  invitePicturesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  invitePictureTile: {
    width: 56,
    height: 74,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  invitePictureImage: {
    width: '100%',
    height: '100%',
  },
  zoomBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  zoomBackdropPress: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  zoomCard: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomImage: {
    width: '100%',
    height: 420,
    borderRadius: 14,
  },
  zoomCloseButton: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  zoomCloseButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  inviteAcceptButton: {
    backgroundColor: '#16A34A',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inviteAcceptButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  inviteDeclineButton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inviteDeclineButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
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
  friendPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#16A34A',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  friendPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
  friendsCard: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8,
  },
  friendsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 10,
  },
  friendAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF1F3',
    borderWidth: 1,
    borderColor: '#FFD2D8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  friendAvatarImage: {
    width: '100%',
    height: '100%',
  },
  friendMain: {
    flex: 1,
    gap: 2,
  },
  friendName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  friendMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  friendUnreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF5864',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  friendUnreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  messagesWrap: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 12,
    backgroundColor: '#FAFAFC',
    padding: 10,
    gap: 8,
  },
  chatHintText: {
    fontSize: 13,
    color: '#6B7280',
  },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  messageBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#FF5864',
  },
  messageBubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E7EB',
  },
  messageText: {
    fontSize: 13,
    color: '#111827',
  },
  messageTextMine: {
    color: '#FFFFFF',
  },
  chatComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 'auto',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    fontSize: 14,
  },
  chatSendButton: {
    backgroundColor: '#FF5864',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chatSendButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
  tabBadge: {
    position: 'absolute',
    top: 2,
    right: '32%',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF5864',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
})
