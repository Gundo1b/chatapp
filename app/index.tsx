import { useState } from 'react'
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { supabase } from '../src/lib/supabaseClient'

type Step = 1 | 2 | 3 | 4

export default function Index() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [age, setAge] = useState('')
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null])
  const [saving, setSaving] = useState(false)

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
    setStep(2)
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

  const onSaveAndGoDashboard = async () => {
    const picked = photos.filter((photo): photo is string => Boolean(photo))
    if (picked.length < 3) {
      Alert.alert('Missing photos', 'Please add 3 photos before continuing.')
      return
    }

    setSaving(true)
    const profile = {
      name: name.trim(),
      gender,
      age: Number(age),
      pictures: picked,
    }

    const { error } = await supabase.from('profiles').insert(profile)
    setSaving(false)

    if (error) {
      Alert.alert('Database error', error.message)
      return
    }

    router.replace({
      pathname: '/dashboard',
      params: { name: profile.name, gender: profile.gender, age: String(profile.age) },
    })
  }

  const completedPhotos = photos.filter(Boolean).length

  return (
    <View style={styles.container}>
      <View style={styles.card}>
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
            <Pressable onPress={onContinueFromName} disabled={!name.trim()} style={!name.trim() ? styles.disabled : undefined}>
              <LinearGradient colors={['#FD297B', '#FF655B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Continue</Text>
              </LinearGradient>
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
            <Pressable onPress={onSaveAndGoDashboard} disabled={saving || completedPhotos < 3} style={saving || completedPhotos < 3 ? styles.disabled : undefined}>
              <LinearGradient colors={['#FD297B', '#FF655B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Go to dashboard'}</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setStep(3)} style={styles.secondaryButton}>
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
})
