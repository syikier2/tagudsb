// utils/dialog.js
// 跨平台的提示與確認視窗。React Native 的 Alert 在網頁版不會顯示，網頁版改用瀏覽器內建的視窗。
import { Alert, Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

/** 只有「確定」的提示 */
export function notify(title, message = '') {
  if (isWeb) window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

/**
 * 「取消 / 確定」的確認視窗
 * @returns {Promise<boolean>} 按確定 = true
 */
export function confirmDialog(title, message, { okText = '確定', destructive = false } = {}) {
  if (isWeb) return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel', onPress: () => resolve(false) },
      { text: okText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
