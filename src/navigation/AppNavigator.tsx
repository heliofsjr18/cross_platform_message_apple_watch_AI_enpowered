import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { onIdTokenChanged } from 'firebase/auth';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';
import { updateApplicationContext } from 'react-native-watch-connectivity';

import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import ChatScreen from '../screens/ChatScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Chat: { userId: string, userName: string };
  AdminDashboard: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { user, loading, setUser } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Ensure user document exists in Firestore
        try {
           await setDoc(doc(db, 'users', firebaseUser.uid), {
              id: firebaseUser.uid,
              email: firebaseUser.email?.toLowerCase() || '',
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
           }, { merge: true });
        } catch (e: any) {
           // Silently handle DB save errors
        }

        // Automatically request notification permissions on login
        const pushToken = await registerForPushNotificationsAsync();
        if (pushToken) {
          try {
             await setDoc(doc(db, 'users', firebaseUser.uid), {
                pushToken: pushToken
             }, { merge: true });
          } catch (e: any) {
             // Silently handle DB save errors to prevent disruptive alerts on launch
          }
        }
        
        // Transmit the Firebase Auth Token to the Apple Watch
        try {
          const idToken = await firebaseUser.getIdToken();
          updateApplicationContext({ firebaseIdToken: idToken, uid: firebaseUser.uid });
        } catch (e) {
          // Silently handle WatchConnectivity errors
        }
      } else {
        // Clear token on the watch if logged out
        updateApplicationContext({ firebaseIdToken: null, uid: null });
      }
    });
    return unsubscribe;
  }, [setUser]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0A84FF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1E1E1E' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#121212' },
        }}
      >
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Contacts' }} />
            <Stack.Screen 
              name="Chat" 
              component={ChatScreen} 
              options={({ route }) => ({ title: route.params.userName })}
            />
            <Stack.Screen 
              name="AdminDashboard" 
              component={AdminDashboardScreen} 
              options={{ title: 'Control Panel' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#121212'
  }
});
