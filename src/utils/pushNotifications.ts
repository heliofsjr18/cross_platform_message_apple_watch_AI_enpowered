import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Set up the local notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0A84FF',
    });
  }

  if (Device.isDevice || Platform.OS === 'android') {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
        console.warn('Failed to get push token for push notification!');
        return;
    }
    
    // Project ID is important for new Expo architecture
    try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId) {
            console.warn("EAS Project ID not found! Cannot request secure Expo token.");
            return undefined;
        }
        
        const tokenData = await Notifications.getExpoPushTokenAsync({
           projectId: projectId
        });
        token = tokenData.data;
    } catch (e) {
        console.warn("Could not fetch Expo Push Token: ", e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export async function sendPushNotification(expoPushToken: string, title: string, body: string) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: { someData: 'goes here' },
    channelId: 'default',
  };

  try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
  } catch (error) {
      console.error("Error sending push payload: ", error);
  }
}
