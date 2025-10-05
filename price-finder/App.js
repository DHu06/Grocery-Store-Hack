// App.js
import React, { useEffect, useRef, useState } from 'react'; // core React tools for state, effects, refs
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  FlatList, Image, Dimensions, Platform
} from 'react-native';                                     // basic building blocks for screens
import MapView, { Marker } from 'react-native-maps';       // the map and pin components
import { NavigationContainer } from '@react-navigation/native'; // top-level navigator provider
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'; // bottom tabs
import { Ionicons } from '@expo/vector-icons';             // nice icons included with Expo
import { Camera } from 'expo-camera';                      // camera component
import * as Location from 'expo-location';                 // ask for GPS permission & position

// create the tab navigator (it returns a set of components we use below)
const Tab = createBottomTabNavigator();

// some colors so the app matches your mockups
const COLORS = {
  bg: '#6f856f',        // the green background you used
  card: '#ffffff',      // white cards/lists
  muted: '#e5e7eb',     // light gray blocks
  text: '#111827',      // near-black text
  pill: '#eef2f7',      // chip/pill background
  pin: '#5f8f5a',       // map pin color
};

// ------ Home Screen (Map + 3 pins) ------
function HomeScreen() {
  // hold the current GPS position (we start with a Vancouver-ish default)
  const [location, setLocation] = useState({
    latitude: 49.246292,         // Vancouver center-ish
    longitude: -123.116226,
    latitudeDelta: 0.08,         // how zoomed in we are vertically
    longitudeDelta: 0.06,        // how zoomed in we are horizontally
  });

  // ask for location on first render
  useEffect(() => {
    (async () => {
      // request foreground location permission from the user
      const { status } = await Location.requestForegroundPermissionsAsync();
      // if granted, fetch the current coordinates and update the map region
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        setLocation((r) => ({
          ...r,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }));
      }
    })();
  }, []); // empty dependency list = run once

  // simple, fake stores to drop pins on the map
  const markers = [
    { id: 'a', title: 'Store A', coord: { latitude: 49.25, longitude: -123.07 } },
    { id: 'b', title: 'Store B', coord: { latitude: 49.24, longitude: -123.12 } },
    { id: 'c', title: 'Store C', coord: { latitude: 49.26, longitude: -123.09 } },
  ];

  return (
    <SafeAreaView style={styles.screen}>                          {/* keeps UI away from notches */}
      <View style={styles.mapContainer}>
        <MapView
          style={StyleSheet.absoluteFill}                         // map fills its parent
          initialRegion={location}                                // starting camera position
          region={location}                                       // controlled region (follows state)
          showsUserLocation                                       // blue dot for me
          showsMyLocationButton                                   // OS “target” button
        >
          {markers.map((m) => (                                  // place each marker
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

// ------ Results Screen (list of cards) ------
function ResultsScreen() {
  // pretend these came from your backend
  const data = [
    { id: '1', name: 'Item name', price: 0.0, store: 'Store name', km: 0.9 },
    { id: '2', name: 'Item name', price: 0.0, store: 'Store name', km: 0.9 },
    { id: '3', name: 'Item name', price: 0.0, store: 'Store name', km: 0.9 },
    { id: '4', name: 'Item name', price: 0.0, store: 'Store name', km: 0.9 },
  ];

  // reusable UI for each list row
  const ItemCard = ({ item }) => (
    <View style={styles.card}>
      {/* left gray thumbnail placeholder */}
      <View style={styles.thumb} />

      {/* right content column */}
      <View style={styles.cardRight}>
        <Text style={styles.itemTitle}>{item.name}</Text>
        <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>

        {/* store + distance */}
        <Text style={styles.storeRow}>
          {item.store}{' '}
          <Text style={styles.kmText}>{item.km}km</Text>
        </Text>

        {/* add-to-list pill button aligned to the right */}
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
      {/* simple Filter button in the top-right to match your mock */}
      <View style={styles.filterRow}>
        <TouchableOpacity onPress={() => alert('Open filters')}>
          <Text style={styles.filterText}>Filter</Text>
        </TouchableOpacity>
      </View>

      {/* the scrollable list */}
      <FlatList
        data={data}                                  // items to render
        keyExtractor={(it) => it.id}                 // stable key for each row
        renderItem={({ item }) => <ItemCard item={item} />} // how to draw each row
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }} // breathing room
      />
    </SafeAreaView>
  );
}

// ------ Search Screen (camera with big round button + back arrow) ------
function SearchScreen({ navigation }) {
  const camRef = useRef(null);                    // reference to the Camera so we can take a photo
  const [hasPermission, setHasPermission] = useState(null); // track permission state
  const [ready, setReady] = useState(false);      // tells us when the camera is ready to use

  // ask for camera permission on mount
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // if permission is not granted, show a friendly message
  if (hasPermission === false) {
    return (
      <SafeAreaView style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: 'white' }}>Camera permission denied</Text>
      </SafeAreaView>
    );
  }

  // press the big circle to “take” a photo (we don’t save it here)
  const snap = async () => {
    if (!camRef.current) return;                  // safety check
    try {
      const photo = await camRef.current.takePictureAsync(); // capture a picture
      alert('Pretend we sent this to the price engine 🚀');   // placeholder action
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <View style={styles.cameraScreen}>
      {/* back arrow in the top-left like your mockup */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('Home')}>
        <Ionicons name="arrow-back" size={28} color="black" />
      </TouchableOpacity>

      {/* the live camera preview */}
      <Camera
        ref={camRef}
        style={StyleSheet.absoluteFill}           // preview fills the entire screen
        ratio="16:9"                              // wide aspect ratio looks modern
        onCameraReady={() => setReady(true)}      // flip the ready flag when camera is ready
      />

      {/* big round shutter in the bottom center */}
      <View style={styles.shutterRow}>
        <TouchableOpacity style={styles.shutter} onPress={snap} />
      </View>
    </View>
  );
}

// ------ A custom middle tab button that looks like a floating circle ------
function CircleTabButton({ children, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.circleTab}>
      {children}
    </TouchableOpacity>
  );
}

// ------ Root App with the bottom tabs ------
export default function App() {
  return (
    <NavigationContainer>   {/* makes navigation work across the whole app */}
      <Tab.Navigator
        screenOptions={({ route }) => ({                      // shared options for all tabs
          headerShown: false,                                 // we draw our own headers
          tabBarShowLabel: false,                             // icons only, no text labels
          tabBarStyle: {                                      // style the bottom bar
            backgroundColor: COLORS.bg,
            borderTopWidth: 0,
            height: 64,
          },
          tabBarIcon: ({ focused, color, size }) => {         // how to draw icons
            // decide which icon to show based on the route name
            const name =
              route.name === 'Home' ? 'home' :
              route.name === 'Results' ? 'reorder-three' :
              'camera';
            return <Ionicons name={name} size={24} color="white" />;
          },
        })}
      >
        {/* left tab: Home with the map */}
        <Tab.Screen name="Home" component={HomeScreen} />

        {/* middle tab: Search with a floating button */}
        <Tab.Screen
          name="Search"
          component={SearchScreen}
          options={{
            tabBarButton: (props) => (                       // replace default button with our circle
              <CircleTabButton {...props}>
                <Ionicons name="camera" size={24} color="white" />
              </CircleTabButton>
            ),
          }}
        />

        {/* right tab: Results list */}
        <Tab.Screen name="Results" component={ResultsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// ------ styles for everything above ------
const styles = StyleSheet.create({
  screen: {                          // base screen style used by Home & Results
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  mapContainer: {                    // a rounded rectangle the map sits inside
    flex: 1,
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',              // clip map corners so they look rounded
  },
  filterRow: {                       // the small "Filter" button row
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'flex-end',
  },
  filterText: {
    color: 'white',
    fontSize: 14,
  },
  card: {                            // each search result row
    backgroundColor: COLORS.card,
    borderRadius: 16,
    flexDirection: 'row',            // thumbnail left, content right
    padding: 0,
    overflow: 'hidden',
    marginBottom: 16,
  },
  thumb: {                           // left gray rectangle image placeholder
    width: 120,
    backgroundColor: COLORS.muted,
  },
  cardRight: {                       // right side of the card
    flex: 1,
    padding: 16,
    gap: 6,
  },
  itemTitle: {                       // “Item name”
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '600',
  },
  itemPrice: {                       // “$0.00”
    fontSize: 12,
    color: '#6b7280',
  },
  storeRow: {                        // “Store name 0.9km”
    marginTop: 8,
    fontSize: 12,
    color: '#374151',
  },
  kmText: {                          // make distance appear lighter
    color: '#6b7280',
  },
  pillButton: {                      // the “Add to list” pill on the right
    backgroundColor: COLORS.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: {
    color: '#374151',
    fontSize: 12,
  },
  cameraScreen: {                    // full-screen camera page
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  backButton: {                      // top-left back arrow button container
    position: 'absolute',
    top: 16 + (Platform.OS === 'android' ? 16 : 0),
    left: 16,
    zIndex: 2,                       // float above camera
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 8,
    padding: 6,
  },
  shutterRow: {                      // row that holds the round capture button
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutter: {                         // big round white button
    width: 68,
    height: 68,
    backgroundColor: 'white',
    borderRadius: 999,
    opacity: 0.95,
  },
  circleTab: {                       // floating middle tab button style
    width: 56,
    height: 56,
    backgroundColor: '#445a44',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,                  // lift it above the bar
    shadowColor: '#000',             // nice little shadow
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
