import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'

export default function Dashboard() {
  const params = useLocalSearchParams<{ name?: string; gender?: string; age?: string }>()

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.text}>Welcome, {params.name || 'User'}</Text>
        <Text style={styles.subtext}>Gender: {params.gender || '-'}</Text>
        <Text style={styles.subtext}>Age: {params.age || '-'}</Text>
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
    gap: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1E1E1E',
  },
  text: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E1E1E',
  },
  subtext: {
    fontSize: 15,
    color: '#6B7280',
  },
})
