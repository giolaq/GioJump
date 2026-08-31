import {WebView} from '@amazon-devices/webview';
import {
  SslErrorData,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewNavigationEvent,
} from '@amazon-devices/webview/dist/types/WebViewTypes';
import {
  useHideSplashScreenCallback,
  usePreventHideSplashScreen,
} from '@amazon-devices/react-native-kepler';
import * as React from 'react';
import {useEffect, useRef} from 'react';
import {BackHandler, StyleSheet, View} from 'react-native';
import type {WebViewMethods} from '@amazon-devices/webview/dist/types/WebViewTypes';
import {VegaOpenIapBridge} from './iapBridge';

const GAME_URL = 'file:///pkg/assets/game/index.html';
const NATIVE_EXIT_MESSAGE = 'giojump:exit';
const VEGA_BOOTSTRAP = `window.__GIO_JUMP_PLATFORM__ = 'vega'; window.__GIO_JUMP_IAP_ENABLED__ = true; true;`;

export const App = () => {
  const webRef = useRef<WebViewMethods>(null);
  const iapBridgeRef = useRef<VegaOpenIapBridge>(null);
  usePreventHideSplashScreen();
  const hideSplashScreen = useHideSplashScreenCallback();

  const sendToGame = (payload: Record<string, unknown>) => {
    const serialized = JSON.stringify(JSON.stringify(payload));
    webRef.current?.injectJavaScript(
      `window.__GIO_JUMP_IAP_RECEIVE&&window.__GIO_JUMP_IAP_RECEIVE(${serialized});true;`,
    );
  };

  const iapBridge = () => {
    if (!iapBridgeRef.current) {
      iapBridgeRef.current = new VegaOpenIapBridge(sendToGame);
    }
    return iapBridgeRef.current;
  };

  useEffect(() => () => {
    iapBridgeRef.current?.dispose();
    iapBridgeRef.current = null;
  }, []);

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        style={styles.webview}
        allowSystemKeyEvents
        allowsDefaultMediaControl={false}
        hasTVPreferredFocus
        injectedJavaScriptBeforeContentLoaded={VEGA_BOOTSTRAP}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction
        mixedContentMode="never"
        source={{uri: GAME_URL}}
        onCloseWindow={() => BackHandler.exitApp()}
        onLoad={(_event: WebViewNavigationEvent) => {
          hideSplashScreen();
        }}
        onMessage={(event: WebViewMessageEvent) => {
          const message = event.nativeEvent.data;
          if (message === NATIVE_EXIT_MESSAGE) {
            BackHandler.exitApp();
          } else {
            iapBridge().handle(message);
          }
        }}
        onError={({
          nativeEvent: {code, url, description},
        }: WebViewErrorEvent) => {
          console.error(`[Gio Jump WebView] (${code}: ${url}) ${description}`);
          hideSplashScreen();
        }}
        onHttpError={({
          nativeEvent: {url, statusCode: code, description, isMainFrame},
        }: WebViewHttpErrorEvent) => {
          console.error(
            `[Gio Jump WebView] HTTP ${code} at ${url}: ${description}; main frame: ${isMainFrame}`,
          );
        }}
        onSslError={({code, url, description}: SslErrorData) => {
          console.error(`[Gio Jump WebView] TLS ${code} at ${url}: ${description}`);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  webview: {backgroundColor: '#80d7eb'},
});
