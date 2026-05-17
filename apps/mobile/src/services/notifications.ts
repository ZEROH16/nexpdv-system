import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true
  })
});

export const getPushToken = async () => {
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return undefined;
  const token = await Notifications.getExpoPushTokenAsync();
  return { token: token.data, platform: Platform.OS };
};
