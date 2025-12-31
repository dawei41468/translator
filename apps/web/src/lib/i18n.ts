import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      // Common UI
      'app.name': 'Live Translator',
      'nav.dashboard': 'Dashboard',
      'nav.settings': 'Settings',
      'auth.login': 'Login',
      'auth.register': 'Register',
      'auth.logout': 'Logout',
      'auth.email': 'Email',
      'auth.password': 'Password',
      'auth.name': 'Name',
      'auth.submit': 'Submit',
      'room.create': 'Start New Conversation',
      'room.join': 'Join Conversation',
      'room.code': 'Room Code',
      'room.scan': 'Scan QR Code to Join',
      'room.enterCode': 'Enter Room Code',
      'conversation.startSpeaking': 'Start Speaking',
      'conversation.stopSpeaking': 'Stop Speaking',
      'conversation.audioOn': 'Audio On',
      'conversation.audioOff': 'Audio Off',
      'conversation.connected': 'Connected',
      'conversation.disconnected': 'Disconnected',
      'conversation.userJoined': 'Participant joined',
      'conversation.userLeft': 'Participant left',
      'error.generic': 'An error occurred',
      'error.network': 'Network error',
      'error.speechNotSupported': 'Speech recognition not supported',
      'error.audioSelectNotSupported': 'Audio output selection not supported',
    },
  },
  zh: {
    translation: {
      // Common UI
      'app.name': '实时翻译器',
      'nav.dashboard': '仪表板',
      'nav.settings': '设置',
      'auth.login': '登录',
      'auth.register': '注册',
      'auth.logout': '登出',
      'auth.email': '邮箱',
      'auth.password': '密码',
      'auth.name': '姓名',
      'auth.submit': '提交',
      'room.create': '开始新对话',
      'room.join': '加入对话',
      'room.code': '房间代码',
      'room.scan': '扫描二维码加入',
      'room.enterCode': '输入房间代码',
      'conversation.startSpeaking': '开始说话',
      'conversation.stopSpeaking': '停止说话',
      'conversation.audioOn': '音频开启',
      'conversation.audioOff': '音频关闭',
      'conversation.connected': '已连接',
      'conversation.disconnected': '已断开',
      'conversation.userJoined': '参与者加入',
      'conversation.userLeft': '参与者离开',
      'error.generic': '发生错误',
      'error.network': '网络错误',
      'error.speechNotSupported': '不支持语音识别',
      'error.audioSelectNotSupported': '不支持音频输出选择',
    },
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,

    interpolation: {
      escapeValue: false, // React already escapes
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

export default i18n;