import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  FlatList, Image
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';

const IDENTIFY_API = 'https://lee-puritanical-tidily.ngrok-free.dev';
const PRICES_API   = 'https://conducive-kingsley-extraversively.ngrok-free.dev';
const DEFAULT_CITY = 'Vancouver, British Columbia, Canada';

const Tab = createBottomTabNavigator();

const COLORS = {
  bg: '#6f856f',
  card: '#ffffff',
  muted: '#e5e7eb',
  text: '#111827',
  pill: '#eef2f7',
  pin: '#5f8f5a',
};

function HomeScreen({ route }) {
  const [location, setLocation] = useState({
    latitude: 49.246292,
    longitude: -123.116226,
    latitudeDelta: 0.08,
    longitudeDelta: 0.06,
  });

  const markers = route?.params?.markers || [];
  const query = route?.params?.query || '';

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

  const mapRef = useRef(null);
  useEffect(() => {
    if (markers.length > 0 && mapRef.current) {
      setTimeout(() => {
        mapRef.current.fitToCoordinates(
          markers.map(m => m.coord),
          {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: true,
          }
        );
      }, 500);
    }
  }, [markers]);

  return (
    <SafeAreaView style={styles.screen}>
      {markers.length > 0 && (
        <View style={styles.mapHeader}>
          <Text style={styles.mapHeaderText}>
            {query ? `Showing results for: ${query}` : 'Store locations'}
          </Text>
        </View>
      )}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={location}
          showsUserLocation
          showsMyLocationButton
        >
          {markers.map((m) => (
            <Marker
              key={m.id}
              coordinate={m.coord}
              title={m.title}
              description={m.description}
              pinColor={COLORS.pin}
            />
          ))}
        </MapView>
      </View>
    </SafeAreaView>
  );
}

function ResultsScreen({ route, navigation }) {
  const rows = route?.params?.rows || [];
  const query = route?.params?.query || '';
  const productInfo = route?.params?.productInfo || null;

  const handleViewOnMap = () => {
    const markers = rows
      .filter(r => r.lat && r.lng && isFinite(r.lat) && isFinite(r.lng))
      .map((r, i) => ({
        id: String(i),
        title: r.store,
        description: `$${Number(r.price).toFixed(2)}${r.distance_km ? ` • ${r.distance_km.toFixed(1)} km` : ''}`,
        coord: {
          latitude: r.lat,
          longitude: r.lng,
        },
      }));
    
    if (markers.length === 0) {
      alert('No store locations available to show on map');
      return;
    }
    
    navigation.navigate('Home', { markers, query });
  };

  const showMapButton = rows.length > 0 && rows.some(r => r.lat && r.lng);

  const ItemCard = ({ item }) => {
    return (
      <View style={styles.card}>
        {item.imageUrl ? (
          <Image 
            source={{ uri: item.imageUrl }} 
            style={styles.thumb}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="image-outline" size={40} color="#9ca3af" />
          </View>
        )}
        <View style={styles.cardRight}>
          <Text style={styles.itemTitle}>{query || 'Item'}</Text>
          <Text style={styles.itemPrice}>${Number(item.price).toFixed(2)}</Text>
          <Text style={styles.storeRow}>
            {item.store}{' '}
            {typeof item.distance_km === 'number' && isFinite(item.distance_km) ? (
              <Text style={styles.kmText}>{item.distance_km.toFixed(1)} km</Text>
            ) : null}
          </Text>
          <Text numberOfLines={2} style={{ fontSize: 11, color: '#6b7280' }}>
            {item.location || 'Location not available'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.filterRow}>
        <Text style={styles.filterText}>
          {query ? `Results for: ${query}` : 'Results'}
        </Text>
        {showMapButton && (
          <TouchableOpacity
            style={styles.mapButton}
            onPress={handleViewOnMap}
          >
            <Ionicons name="map" size={16} color="white" />
            <Text style={styles.mapButtonText}>View on Map</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <ItemCard item={item} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          <Text style={{ color: 'white', textAlign: 'center', marginTop: 24 }}>
            No results yet. Scan a food item to get started!
          </Text>
        }
      />
      {productInfo && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Text style={{ color: 'white', opacity: 0.8, fontSize: 12 }}>
            Detected: {productInfo.brand ? `${productInfo.brand} ` : ''}{productInfo.name || 'Unknown item'}
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
    
    setLoading(true);

    try {
      const photo = await camRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });

      // STEP 1: Identify
      const identifyResp = await fetch(`${IDENTIFY_API}/api/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photo.base64 }),
      });
      
      if (!identifyResp.ok) {
        throw new Error(`Identify API returned ${identifyResp.status}`);
      }
      
      const identifyData = await identifyResp.json();
      
      if (!identifyData?.success || !identifyData?.item) {
        throw new Error(identifyData?.error || 'Could not identify item');
      }
      
      const product = identifyData.item;
      console.log('Product identified:', product);

      // STEP 2: Check if food IMMEDIATELY - BEFORE any state changes
      const category = (product.category || '').toLowerCase();
      const name = (product.name || '').toLowerCase();
      const description = (product.description || '').toLowerCase();
      const brand = (product.brand || '').toLowerCase();
      
      const foodKeywords = [
        'food', 'grocery', 'snack', 'beverage', 'drink', 'sauce', 
        'noodle', 'pasta', 'cereal', 'bread', 'meat', 'dairy', 
        'vegetable', 'fruit', 'candy', 'chocolate', 'chip', 'cookie',
        'ramen', 'instant', 'soup', 'meal', 'protein', 'bar',
        'juice', 'soda', 'tea', 'coffee', 'milk', 'yogurt',
        'cheese', 'butter', 'oil', 'spice', 'condiment', 'rice',
        'bean', 'nut', 'cracker', 'popcorn', 'pretzel'
      ];
      
      const isFoodItem = foodKeywords.some(keyword => 
        category.includes(keyword) || 
        name.includes(keyword) || 
        description.includes(keyword) ||
        brand.includes(keyword)
      );
      
      if (!isFoodItem) {
        setLoading(false);
        alert(
          'Not a food item\n\n' +
          'Please scan a food or grocery product.\n\n' +
          'Detected: ' + (product.category || product.name || 'Unknown item')
        );
        return; // STOP - don't do anything else
      }

      // STEP 3: Build search query
      const { name: productName, brand: productBrand } = product;
      const q = [productBrand, productName].filter(Boolean).join(' ').trim();
      
      if (!q) {
        throw new Error('Could not extract product name');
      }

      // STEP 4: Get prices
      const coords = await getCoords();
      const params = new URLSearchParams({
        q,
        city: DEFAULT_CITY,
        top: '5',
        ...(coords ? { 
          lat: String(coords.lat), 
          lng: String(coords.lng), 
          sort: 'closest' 
        } : {}),
      });

      const pricesResp = await fetch(`${PRICES_API}/v1/prices/search?${params.toString()}`);
      
      if (!pricesResp.ok) {
        throw new Error(`Prices API returned ${pricesResp.status}`);
      }
      
      const rows = await pricesResp.json();
      console.log('Prices received:', rows);

      // STEP 5: Check if we got results
      if (!rows || rows.length === 0) {
        setLoading(false);
        alert('No prices found for this item in your area.\n\nTry scanning a different product.');
        return; // STOP
      }

      // STEP 6: Only NOW show success and navigate
      setResult(product);
      setLoading(false);
      
      setTimeout(() => {
        navigation.navigate('Results', { rows, query: q, productInfo: product });
        setResult(null);
      }, 1500);

    } catch (error) {
      console.error('Scan error:', error);
      setLoading(false);
      setResult(null);
      alert('Error: ' + error.message);
    }
  };

  if (permission && !permission.granted) {
    return (
      <SafeAreaView style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: 'white', fontSize: 16, textAlign: 'center', paddingHorizontal: 20 }}>
          Camera permission is required to scan products
        </Text>
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
        <Ionicons name="arrow-back" size={28} color="white" />
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
            <View style={{ alignItems: 'center', marginBottom: 10 }}>
              <Ionicons name="checkmark-circle" size={48} color="#10b981" />
            </View>
            <Text style={styles.resultTitle}>{result.name || 'Unknown Item'}</Text>
            {result.brand ? <Text style={styles.resultText}>Brand: {result.brand}</Text> : null}
            <Text style={{ color: '#6b7280', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
              Finding prices...
            </Text>
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
            tabBarStyle: {display: 'none'},
            tabBarButton: (props) => (
              <CircleTabButton {...props}>
                <Ionicons name="camera" size={24} color="white" style={{ transform: [{translateY: 14}]}}/>
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
  mapHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  mapHeaderText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterText: {
    color: 'white',
    fontSize: 14,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  mapButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    flexDirection: 'row',
    padding: 0,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  thumb: {
    width: 120,
    height: 120,
    backgroundColor: COLORS.muted,
  },
  thumbPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardRight: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 20,
    color: '#10b981',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  storeRow: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  kmText: {
    color: '#6b7280',
    fontWeight: 'normal',
  },
  cameraScreen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 24,
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
    marginBottom: 8,
    color: '#111827',
    textAlign: 'center',
  },
  resultText: {
    fontSize: 14,
    marginBottom: 4,
    color: '#374151',
    textAlign: 'center',
  },
  closeButton: {
    marginTop: 12,
    backgroundColor: COLORS.bg,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
});