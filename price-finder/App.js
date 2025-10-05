import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  FlatList, Image, Dimensions, Platform
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';

const Tab = createBottomTabNavigator();

const COLORS = {
  bg: '#6f856f',
  card: '#ffffff',
  muted: '#e5e7eb',
  text: '#111827',
  pill: '#eef2f7',
  pin: '#5f8f5a',
};

// IMPORTANT: Replace with your computer's local IP address
const API_URL = 'http://172.16.131.105:3000'; // Change XXX to your actual IP

function HomeScreen() {
  const [location, setLocation] = useState({
    latitude: 49.246292,
    longitude: -123.116226,
    latitudeDelta: 0.08,
    longitudeDelta: 0.06,
  });

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        setLocation((r) => ({
          ...r,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }));
      }
    })();
  }, []);

  const markers = [
    { id: 'a', title: 'Store A', coord: { latitude: 49.25, longitude: -123.07 } },
    { id: 'b', title: 'Store B', coord: { latitude: 49.24, longitude: -123.12 } },
    { id: 'c', title: 'Store C', coord: { latitude: 49.26, longitude: -123.09 } },
  ];

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.mapContainer}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={location}
          region={location}
          showsUserLocation
          showsMyLocationButton
        >
          {markers.map((m) => (
            <Marker
              key={m.id}
              coordinate={m.coord}
              title={m.title}
              pinColor={COLORS.pin}
            />
          ))}
        </MapView>
      </View>
    </SafeAreaView>
  );
}

function ResultsScreen() {
  const data = [
    { id: '1', name: 'Item name', price: 0.0, store: 'Store name', km: 0.9 },
    { id: '2', name: 'Item name', price: 0.0, store: 'Store name', km: 0.9 },
    { id: '3', name: 'Item name', price: 0.0, store: 'Store name', km: 0.9 },
    { id: '4', name: 'Item name', price: 0.0, store: 'Store name', km: 0.9 },
  ];

  const ItemCard = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.thumb} />
      <View style={styles.cardRight}>
        <Text style={styles.itemTitle}>{item.name}</Text>
        <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
        <Text style={styles.storeRow}>
          {item.store}{' '}
          <Text style={styles.kmText}>{item.km}km</Text>
        </Text>
        <View style={{ alignItems: 'flex-end' }}>
          <TouchableOpacity style={styles.pillButton} onPress={() => alert('Added!')}>
            <Text style={styles.pillText}>Add to list</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.filterRow}>
        <TouchableOpacity onPress={() => alert('Open filters')}>
          <Text style={styles.filterText}>Filter</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={data}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => <ItemCard item={item} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
      />
    </SafeAreaView>
  );
}

function SearchScreen({ navigation }) {
  const camRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

useEffect(() => {
   if (!permission?.granted) requestPermission();
}, [permission]);

  if (permission && !permission.granted) {
    return (
      <SafeAreaView style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: 'white' }}>Camera permission denied</Text>
      </SafeAreaView>
    );
  }

  const snap = async () => {
    if (!camRef.current || loading) return;
    
    try {
      setLoading(true);
      
      const photo = await camRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });

      console.log('Photo captured, sending to backend...');

      const response = await fetch(`${API_URL}/api/identify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: photo.base64 }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setResult(data.item);
        console.log('Item identified:', data.item);
      } else {
        alert('Error: ' + data.error);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to identify item: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.cameraScreen}>
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => {
          setResult(null);
          navigation.navigate('Home');
        }}
      >
        <Ionicons name="arrow-back" size={28} color="black" />
      </TouchableOpacity>

      <CameraView
        ref={camRef}
        style={StyleSheet.absoluteFill}
        facing="back"
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <Text style={{ color: 'white', fontSize: 18, marginBottom: 10 }}>
            Analyzing...
          </Text>
        </View>
      )}

      {result && !loading && (
        <View style={styles.resultOverlay}>
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{result.name}</Text>
            <Text style={styles.resultText}>Brand: {result.brand}</Text>
            <Text style={styles.resultText}>Category: {result.category}</Text>
            <Text style={styles.resultText}>Description: {result.description}</Text>
            <Text style={styles.resultText}>Confidence: {result.confidence}</Text>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setResult(null)}
            >
              <Text style={{ color: 'white', fontWeight: 'bold' }}>Scan Another</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.shutterRow}>
        <TouchableOpacity 
          style={[styles.shutter, loading && { opacity: 0.5 }]} 
          onPress={snap}
          disabled={loading}
        />
      </View>
    </View>
  );
}

function CircleTabButton({ children, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.circleTab}>
      {children}
    </TouchableOpacity>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: {
            backgroundColor: COLORS.bg,
            borderTopWidth: 0,
            height: 64,
          },
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            if (route.name === 'Home') {
              iconName = 'home';
            } else if (route.name === 'Results') {
              iconName = 'reorder-three';
            } else {
              iconName = 'camera';
            }
            return <Ionicons name={iconName} size={24} color="white" />;
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen
          name="Search"
          component={SearchScreen}
          options={{
            tabBarButton: (props) => (
              <CircleTabButton {...props}>
                <Ionicons name="camera" size={24} color="white" />
              </CircleTabButton>
            ),
          }}
        />
        <Tab.Screen name="Results" component={ResultsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  mapContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'flex-end',
  },
  filterText: {
    color: 'white',
    fontSize: 14,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    flexDirection: 'row',
    padding: 0,
    overflow: 'hidden',
    marginBottom: 16,
  },
  thumb: {
    width: 120,
    backgroundColor: COLORS.muted,
  },
  cardRight: {
    flex: 1,
    padding: 16,
    gap: 6,
  },
  itemTitle: {
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '600',
  },
  itemPrice: {
    fontSize: 12,
    color: '#6b7280',
  },
  storeRow: {
    marginTop: 8,
    fontSize: 12,
    color: '#374151',
  },
  kmText: {
    color: '#6b7280',
  },
  pillButton: {
    backgroundColor: COLORS.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: {
    color: '#374151',
    fontSize: 12,
  },
  cameraScreen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  backButton: {
    position: 'absolute',
    top: 16 + (Platform.OS === 'android' ? 16 : 0),
    left: 16,
    zIndex: 2,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 8,
    padding: 6,
  },
  shutterRow: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutter: {
    width: 68,
    height: 68,
    backgroundColor: 'white',
    borderRadius: 999,
    opacity: 0.95,
  },
  circleTab: {
    width: 56,
    height: 56,
    backgroundColor: '#445a44',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf:'center',
    top: -18,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },

  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  resultOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    zIndex: 1,
  },
  resultCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#111827',
  },
  resultText: {
    fontSize: 14,
    marginBottom: 6,
    color: '#374151',
  },
  closeButton: {
    marginTop: 12,
    backgroundColor: COLORS.bg,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
});