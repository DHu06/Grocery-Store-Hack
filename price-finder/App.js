import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  FlatList, Platform
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';

// ───────────────────────────────────────────────────────────────────────────────
// CONFIG – REPLACE WITH YOUR OWN ADDRESSES
// ───────────────────────────────────────────────────────────────────────────────
// 1) The server that identifies an item from an image and returns JSON:
//    expected response: { success: boolean, item: { name, brand, category, description, confidence } }
const IDENTIFY_API = 'https://lee-puritanical-tidily.ngrok-free.dev'; // e.g. http://<your-mac-lan-ip>:3000

// 2) The server that exposes GET /v1/prices/search
//    returns: Row[] where Row = { store, price, location, lat?, lng?, distance_km? }
const PRICES_API   = 'https://conducive-kingsley-extraversively.ngrok-free.dev'; // e.g. http://<your-mac-lan-ip>:3001

// City is required in your backend
const DEFAULT_CITY = 'Vancouver, British Columbia, Canada';

// ───────────────────────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

const COLORS = {
  bg: '#6f856f',
  card: '#ffffff',
  muted: '#e5e7eb',
  text: '#111827',
  pill: '#eef2f7',
  pin: '#5f8f5a',
};

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

function ResultsScreen({ route }) {
  const rows = route?.params?.rows || [];
  const query = route?.params?.query || '';
  const productInfo = route?.params?.productInfo || null;

  const ItemCard = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.thumb} />
      <View style={styles.cardRight}>
        <Text style={styles.itemTitle}>{query || 'Item'}</Text>
        <Text style={styles.itemPrice}>${Number(item.price).toFixed(2)}</Text>
        <Text style={styles.storeRow}>
          {item.store}{' '}
          {typeof item.distance_km === 'number' && isFinite(item.distance_km) && (
            <Text style={styles.kmText}>{item.distance_km.toFixed(1)} km</Text>
          )}
        </Text>
        <Text numberOfLines={2} style={{ fontSize: 11, color: '#6b7280' }}>
          {item.location}
        </Text>
        <View style={{ alignItems: 'flex-end', marginTop: 6 }}>
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
        <Text style={styles.filterText}>
          {query ? `Results for: ${query}` : 'Results'}
        </Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <ItemCard item={item} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          <Text style={{ color: 'white', textAlign: 'center', marginTop: 24 }}>
            No results yet.
          </Text>
        }
      />
      {productInfo && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Text style={{ color: 'white', opacity: 0.8, fontSize: 12 }}>
            Detected: {productInfo.brand ? `${productInfo.brand} ` : ''}{productInfo.name || ''}
          </Text>
        </View>
      )}
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

  const getCoords = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const pos = await Location.getCurrentPositionAsync({});
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  };

  const snap = async () => {
    if (!camRef.current || loading) return;
    try {
      setLoading(true);

      // 1) Take picture
      const photo = await camRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });

      // 2) Call IDENTIFY API
      const identifyResp = await fetch(`${IDENTIFY_API}/api/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photo.base64 }),
      });
      if (!identifyResp.ok) throw new Error(`Identify error: ${identifyResp.status}`);
      const identifyData = await identifyResp.json();
      // Expected shape: { success, item: { name, brand, category, description, confidence } }
      if (!identifyData?.success || !identifyData?.item) {
        throw new Error(identifyData?.error || 'Identify failed');
      }
      const product = identifyData.item;
      setResult(product);

      // 3) Build q from brand + name
      const { name, brand } = product;
      const q = [brand, name].filter(Boolean).join(' ').trim();
      if (!q) throw new Error('No name/brand returned from identify API');

      // 4) Optional: get device coords for "closest"
      const coords = await getCoords();

      // 5) Build query params for PRICES API (city required)
      const params = new URLSearchParams({
        q,
        city: DEFAULT_CITY,
        top: '5',
        ...(coords ? { lat: String(coords.lat), lng: String(coords.lng), sort: 'closest' } : {}),
      });

      // 6) Call PRICES API (GET)
      const pricesResp = await fetch(`${PRICES_API}/v1/prices/search?${params.toString()}`);
      if (!pricesResp.ok) throw new Error(`Prices error: ${pricesResp.status}`);
      const rows = await pricesResp.json(); // array

      // 7) Navigate to Results with data
      navigation.navigate('Results', { rows, query: q, productInfo: product });
    } catch (error) {
      console.error('Error:', error);
      alert('Failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (permission && !permission.granted) {
    return (
      <SafeAreaView style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: 'white' }}>Camera permission denied</Text>
      </SafeAreaView>
    );
  }

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

      <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />

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
            {result.brand ? <Text style={styles.resultText}>Brand: {result.brand}</Text> : null}
            {result.category ? <Text style={styles.resultText}>Category: {result.category}</Text> : null}
            {result.description ? <Text style={styles.resultText}>Description: {result.description}</Text> : null}
            {result.confidence ? <Text style={styles.resultText}>Confidence: {result.confidence}</Text> : null}
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
          tabBarIcon: ({ color }) => {
            let iconName;
            if (route.name === 'Home') iconName = 'home';
            else if (route.name === 'Results') iconName = 'reorder-three';
            else iconName = 'camera';
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
    alignItems: 'flex-start',
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
    alignSelf: 'center',
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
