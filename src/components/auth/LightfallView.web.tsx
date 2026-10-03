import React from 'react';
import { StyleSheet, View } from 'react-native';

import { lightfallHtml } from './lightfallHtml';

const HTML = lightfallHtml();

/** Web build (the browser preview of the app): the same page, in an iframe. The phone builds use LightfallView.tsx. */
export default function LightfallView() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {React.createElement('iframe', {
        srcDoc: HTML,
        title: 'Lightfall',
        sandbox: 'allow-scripts',
        tabIndex: -1,
        'aria-hidden': true,
        style: { border: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none', background: 'transparent' },
      })}
    </View>
  );
}
