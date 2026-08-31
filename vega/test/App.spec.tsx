import * as React from 'react';
import {render} from '@testing-library/react-native';
import {App} from '../src/App';

jest.mock('@amazon-devices/webview', () => ({
  WebView: 'WebView',
}));

jest.mock('@amazon-devices/react-native-kepler', () => ({
  usePreventHideSplashScreen: jest.fn(),
  useHideSplashScreenCallback: jest.fn(() => jest.fn()),
  StyleSheet: {create: (styles: unknown) => styles},
  View: 'View',
}));

jest.mock('react-native-iap', () => ({
  endConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(async () => []),
  finishTransaction: jest.fn(async () => undefined),
  getAvailablePurchases: jest.fn(async () => []),
  initConnection: jest.fn(async () => true),
  purchaseErrorListener: jest.fn(() => ({remove: jest.fn()})),
  purchaseUpdatedListener: jest.fn(() => ({remove: jest.fn()})),
  requestPurchase: jest.fn(async () => null),
}));

describe('App', () => {
  it('renders the bundled game WebView', () => {
    const {toJSON} = render(<App />);
    expect(toJSON()).toBeTruthy();
  });
});
