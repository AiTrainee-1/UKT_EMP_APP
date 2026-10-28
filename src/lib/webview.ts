// react-native-webview 14 declares its component as `class WebView<P = undefined> extends Component<WebViewProps & P>`.
// `WebViewProps & undefined` is `never`; React Native 0.87's Strict TypeScript API (Expo SDK 58) stopped hiding that, so
// `<WebView source={...} />` no longer type-checked ("Type ... is not assignable to type 'never'").
//
// This re-types the very same runtime component with its real props and ref. Nothing changes at runtime: it is the
// object react-native-webview exports. Remove it once react-native-webview fixes the declaration.
import type { ComponentType, RefAttributes } from 'react';
import { WebView as NativeWebView, type WebViewProps } from 'react-native-webview';

/** What `ref.current` is: `injectJavaScript`, `reload`, `postMessage`... */
export type WebViewHandle = NativeWebView;

export const WebView = NativeWebView as unknown as ComponentType<WebViewProps & RefAttributes<WebViewHandle>>;
