import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../src/lib/supabaseClient'

type Step = 1 | 2 | 3 | 4 | 5
type NameStatus = boolean | null

const PHOTO_BUCKET = 'profile-pictures'

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

const uploadProfilePictures = async (profileName: string, pictureUris: string[]) => {
  const safeName = sanitizePathSegment(profileName)
  const uploadedUrls: string[] = []

  for (let i = 0; i < pictureUris.length; i += 1) {
    const uri = pictureUris[i]
    const ext = guessImageExtension(uri)
    const contentType = contentTypeForExtension(ext)
    const objectPath = `${safeName}/${Date.now()}-${i}.${ext}`

    const response = await fetch(uri)
    const blob = await response.blob()

    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(objectPath, blob, {
      contentType,
      upsert: false,
    })

    if (uploadError) {
      throw new Error(uploadError.message)
    }

    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(objectPath)
    uploadedUrls.push(data.publicUrl)
  }

  return uploadedUrls
}

export default function Index() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [age, setAge] = useState('')
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null])
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [checkingName, setCheckingName] = useState(false)
  const [isNameAvailable, setIsNameAvailable] = useState<NameStatus>(null)
  const [nameCheckError, setNameCheckError] = useState('')

  useEffect(() => {
    const bootstrapSession = async () => {
      const storedProfile = await AsyncStorage.getItem('registered_profile')
      if (storedProfile) {
        try {
          const parsed = JSON.parse(storedProfile) as {
            name?: string
            gender?: string
            age?: number
            avatar?: string
            pictures?: string[]
          }
          router.replace({
            pathname: '/dashboard',
            params: {
              name: parsed.name || 'User',
              gender: parsed.gender || '-',
              age: String(parsed.age ?? '-'),
              avatar: parsed.avatar || '',
            },
          })
          return
        } catch {
          await AsyncStorage.removeItem('registered_profile')
        }
      }
      setCheckingSession(false)
    }

    void bootstrapSession()
  }, [router])

  useEffect(() => {
    if (checkingSession) return
    const trimmedName = name.trim()

    if (!trimmedName) {
      setCheckingName(false)
      setIsNameAvailable(null)
      setNameCheckError('')
      return
    }

    const timeoutId = setTimeout(async () => {
      setCheckingName(true)
      setNameCheckError('')

      const { data: existingProfile, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('name', trimmedName)
        .maybeSingle()

      if (error) {
        setIsNameAvailable(null)
        setNameCheckError('Could not verify name right now.')
        setCheckingName(false)
        return
      }

      setIsNameAvailable(!existingProfile)
      setCheckingName(false)
    }, 450)

    return () => clearTimeout(timeoutId)
  }, [name, checkingSession])

  const pickPhoto = async (slot: number) => {
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

    const next = [...photos]
    next[slot] = result.assets[0].uri
    setPhotos(next)
  }

  const onContinueFromName = () => {
    if (!name.trim()) return
    if (checkingName) return
    if (isNameAvailable !== true) {
      Alert.alert('Name unavailable', 'Please choose a different name.')
      return
    }
    setStep(2)
  }

  const onGoToLogin = () => {
    router.push('/login')
  }

  const onSelectGender = (value: string) => {
    setGender(value)
    setStep(3)
  }

  const onContinueFromAge = () => {
    const parsed = Number(age)
    if (!Number.isInteger(parsed) || parsed < 18 || parsed > 100) {
      Alert.alert('Invalid age', 'Enter a valid age between 18 and 100.')
      return
    }
    setStep(4)
  }

  const onContinueFromPhotos = () => {
    const picked = photos.filter((photo): photo is string => Boolean(photo))
    if (picked.length < 3) {
      Alert.alert('Missing photos', 'Please add 3 photos before continuing.')
      return
    }
    setStep(5)
  }

  const onSaveAndGoDashboard = async () => {
    const trimmedName = name.trim()
    const picked = photos.filter((photo): photo is string => Boolean(photo))
    const trimmedPassword = password.trim()

    if (picked.length < 3) {
      Alert.alert('Missing photos', 'Please add 3 photos before continuing.')
      return
    }

    if (trimmedPassword.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.')
      return
    }

    if (trimmedPassword !== confirmPassword.trim()) {
      Alert.alert('Password mismatch', 'Password and confirm password must match.')
      return
    }

    setSaving(true)

    const { data: existingProfile, error: lookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('name', trimmedName)
      .maybeSingle()

    if (lookupError) {
      setSaving(false)
      Alert.alert('Database error', lookupError.message)
      return
    }

    if (existingProfile) {
      setSaving(false)
      Alert.alert('Name unavailable', 'That name already exists. Please choose another one.')
      return
    }

    let uploadedPictures: string[] = []
    try {
      uploadedPictures = await uploadProfilePictures(trimmedName, picked)
    } catch (uploadError) {
      setSaving(false)
      const message = uploadError instanceof Error ? uploadError.message : 'Could not upload photos.'
      Alert.alert('Upload error', message)
      return
    }

    const profile = {
      name: trimmedName,
      gender,
      age: Number(age),
      pictures: uploadedPictures,
      password_hash: trimmedPassword,
    }

    const { error } = await supabase.from('profiles').insert(profile)
    setSaving(false)

    if (error) {
      if (error.code === '23505') {
        Alert.alert('Name unavailable', 'That name already exists. Please choose another one.')
        return
      }
      Alert.alert('Database error', error.message)
      return
    }

    await AsyncStorage.setItem(
      'registered_profile',
      JSON.stringify({
        name: profile.name,
        gender: profile.gender,
        age: profile.age,
        avatar: uploadedPictures[0] || '',
        pictures: uploadedPictures,
      }),
    )

    router.replace({
      pathname: '/dashboard',
      params: {
        name: profile.name,
        gender: profile.gender,
        age: String(profile.age),
        avatar: uploadedPictures[0] || '',
      },
    })
  }

  const completedPhotos = photos.filter(Boolean).length

  if (checkingSession) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color="#FF5864" />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
        {step === 1 ? (
          <>
            <Text style={styles.title}>What is your name?</Text>
            <Text style={styles.subtitle}>Tell us how you want to be shown.</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              placeholderTextColor="#6B7280"
              style={styles.input}
            />
            {nameCheckError ? <Text style={styles.nameStatusError}>{nameCheckError}</Text> : null}
            {!nameCheckError && checkingName ? <Text style={styles.nameStatusNeutral}>Checking name...</Text> : null}
            {!nameCheckError && !checkingName && name.trim() && isNameAvailable === true ? (
              <Text style={styles.nameStatusAvailable}>Name is available</Text>
            ) : null}
            {!nameCheckError && !checkingName && name.trim() && isNameAvailable === false ? (
              <Text style={styles.nameStatusError}>That name already exists</Text>
            ) : null}
            <Pressable
              onPress={onContinueFromName}
              disabled={!name.trim() || checkingName || isNameAvailable !== true}
              style={!name.trim() || checkingName || isNameAvailable !== true ? styles.disabled : undefined}
            >
              <LinearGradient colors={['#FD297B', '#FF655B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Continue</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={onGoToLogin} style={styles.loginLinkWrap}>
              <Text style={styles.loginLinkText}>Already have an account? Log in</Text>
            </Pressable>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.title}>Choose your gender</Text>
            <Text style={styles.subtitle}>Pick the option that fits you best.</Text>
            <Pressable onPress={() => onSelectGender('Man')}>
              <LinearGradient colors={['#FD297B', '#FF655B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Man</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => onSelectGender('Woman')}>
              <LinearGradient colors={['#FD297B', '#FF655B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Woman</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => onSelectGender('Non-binary')}>
              <LinearGradient colors={['#FD297B', '#FF655B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Non-binary</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setStep(1)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={styles.title}>How old are you?</Text>
            <Text style={styles.subtitle}>You must be at least 18 years old.</Text>
            <TextInput
              value={age}
              onChangeText={setAge}
              placeholder="Enter your age"
              placeholderTextColor="#6B7280"
              keyboardType="number-pad"
              style={styles.input}
            />
            <Pressable onPress={onContinueFromAge}>
              <LinearGradient colors={['#FD297B', '#FF655B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Continue</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setStep(2)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Text style={styles.title}>Add 3 photos</Text>
            <Text style={styles.subtitle}>Choose clear photos. {completedPhotos}/3 selected</Text>
            <View style={styles.photoGrid}>
              {photos.map((photo, index) => (
                <Pressable key={index} onPress={() => pickPhoto(index)} style={styles.photoCard}>
                  <View style={styles.photoBadge}>
                    <Text style={styles.photoBadgeText}>{index + 1}</Text>
                  </View>
                  {photo ? (
                    <>
                      <Image source={{ uri: photo }} style={styles.photo} />
                      <View style={styles.photoOverlay}>
                        <Text style={styles.photoOverlayText}>Tap to change</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.emptyPhoto}>
                      <Text style={styles.plus}>+</Text>
                      <Text style={styles.emptyPhotoText}>Tap to add</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
            <Pressable onPress={onContinueFromPhotos} disabled={completedPhotos < 3} style={completedPhotos < 3 ? styles.disabled : undefined}>
              <LinearGradient colors={['#FD297B', '#FF655B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Continue</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setStep(3)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <Text style={styles.title}>Create a password</Text>
            <Text style={styles.subtitle}>Use at least 8 characters.</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor="#6B7280"
              secureTextEntry
              style={styles.input}
            />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm password"
              placeholderTextColor="#6B7280"
              secureTextEntry
              style={styles.input}
            />
            <Pressable
              onPress={onSaveAndGoDashboard}
              disabled={saving || password.trim().length < 8 || confirmPassword.trim().length < 8}
              style={saving || password.trim().length < 8 || confirmPassword.trim().length < 8 ? styles.disabled : undefined}
            >
              <LinearGradient colors={['#FD297B', '#FF655B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Finish registration'}</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setStep(4)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9F9FB',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  logo: {
    width: 150,
    height: 72,
    alignSelf: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1E1E1E',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#1E1E1E',
    fontSize: 16,
  },
  nameStatusNeutral: {
    fontSize: 13,
    color: '#6B7280',
  },
  nameStatusAvailable: {
    fontSize: 13,
    color: '#15803D',
  },
  nameStatusError: {
    fontSize: 13,
    color: '#B91C1C',
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#FF5864',
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF5864',
  },
  photoGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  photoCard: {
    width: '31%',
    minWidth: 90,
    aspectRatio: 3 / 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  emptyPhoto: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#FF5864',
    borderRadius: 12,
    margin: 6,
    backgroundColor: '#F9F9FB',
  },
  plus: {
    fontSize: 28,
    lineHeight: 28,
    color: '#FF5864',
    fontWeight: '500',
  },
  emptyPhotoText: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
  },
  photoBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF5864',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  photoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(30,30,30,0.58)',
    paddingVertical: 6,
    alignItems: 'center',
  },
  photoOverlayText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  loginLinkWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  loginLinkText: {
    fontSize: 14,
    color: '#FF5864',
    fontWeight: '600',
  },
})
