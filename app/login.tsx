import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../src/lib/supabaseClient'

type ProfileRow = {
  name: string
  gender: string
  age: number
  pictures: string[]
}

export default function Login() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

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

  const onLogin = async () => {
    const trimmedName = name.trim()
    const trimmedPassword = password.trim()
    setErrorMessage('')

    if (!trimmedName || !trimmedPassword) {
      setErrorMessage('Enter your name and password.')
      Alert.alert('Missing fields', 'Enter your name and password.')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('verify_profile_login', {
        p_name: trimmedName,
        p_password: trimmedPassword,
      })

      if (error) {
        setErrorMessage(error.message)
        Alert.alert('Login failed', error.message)
        return
      }

      if (!Array.isArray(data) || data.length === 0) {
        setErrorMessage('Name or password is incorrect.')
        Alert.alert('Invalid credentials', 'Name or password is incorrect.')
        return
      }

      const profile = data[0] as ProfileRow
      const avatar = profile.pictures?.[0] || ''

      await AsyncStorage.setItem(
        'registered_profile',
        JSON.stringify({
          name: profile.name,
          gender: profile.gender,
          age: profile.age,
          avatar,
          pictures: profile.pictures || [],
        }),
      )

      router.replace({
        pathname: '/dashboard',
        params: {
          name: profile.name,
          gender: profile.gender || '-',
          age: String(profile.age ?? '-'),
          avatar,
        },
      })
    } catch {
      setErrorMessage('Could not reach the server. Please try again.')
      Alert.alert('Login failed', 'Could not reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Log in to continue.</Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Enter your name"
          placeholderTextColor="#6B7280"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Enter password"
          placeholderTextColor="#6B7280"
          secureTextEntry
          style={styles.input}
        />

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <TouchableOpacity activeOpacity={0.9} onPress={() => void onLogin()} disabled={loading} style={loading ? styles.disabled : undefined}>
          <LinearGradient colors={['#FD297B', '#FF655B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{loading ? 'Logging in...' : 'Log in'}</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Pressable onPress={() => router.replace('/')} style={styles.linkWrap}>
          <Text style={styles.linkText}>Need an account? Register</Text>
        </Pressable>
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
  errorText: {
    fontSize: 13,
    color: '#B91C1C',
    marginTop: 2,
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
  linkWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 14,
    color: '#FF5864',
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
})
