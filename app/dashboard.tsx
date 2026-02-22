import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'

export default function Dashboard() {
  const params = useLocalSearchParams<{ name?: string; gender?: string; age?: string }>()

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.profileIconWrap}>
            <Ionicons name="person-outline" size={20} color="#FF5864" />
          </View>
          <Text style={styles.title}>Dashboard</Text>
        </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  profileIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#FFD2D8',
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
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
