// SDK 58 / React Native 0.87+ ships the "Strict TypeScript API": `react-native` no longer exports a number of old helper types.
// Third-party declaration files that still import them (Moti's `MotiView`/`MotiText`... props import all of the names below)
// then silently resolve them to `any`, which made every `transition={{ type: 'timing', ... }}` on a Moti component fail to compile.
//
// This puts the same names back, with the definitions React Native's own legacy typings used (react-native/types_DEPRECATED).
// It only adds types: nothing here exists at runtime. Delete this file (and its "files" entry in tsconfig.json) once Moti stops
// importing them.
//
// Why it is listed under "files" in tsconfig.json: TypeScript only applied this augmentation when the file was read before the
// app's own files, which "files" guarantees (found through "include" alone, the Moti errors came back).
import 'react-native';
import type { Animated } from 'react-native';

declare module 'react-native' {
  export type AnimatableNumericValue = number | Animated.AnimatedNode;
  export type AnimatableStringValue = string | Animated.AnimatedNode;
  export type FlexAlignType = 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';

  export interface PerspectiveTransform {
    perspective: AnimatableNumericValue;
  }
  export interface RotateTransform {
    rotate: AnimatableStringValue;
  }
  export interface RotateXTransform {
    rotateX: AnimatableStringValue;
  }
  export interface RotateYTransform {
    rotateY: AnimatableStringValue;
  }
  export interface RotateZTransform {
    rotateZ: AnimatableStringValue;
  }
  export interface ScaleTransform {
    scale: AnimatableNumericValue;
  }
  export interface ScaleXTransform {
    scaleX: AnimatableNumericValue;
  }
  export interface ScaleYTransform {
    scaleY: AnimatableNumericValue;
  }
  export interface TranslateXTransform {
    translateX: AnimatableNumericValue | `${number}%`;
  }
  export interface TranslateYTransform {
    translateY: AnimatableNumericValue | `${number}%`;
  }
  export interface SkewXTransform {
    skewX: AnimatableStringValue;
  }
  export interface SkewYTransform {
    skewY: AnimatableStringValue;
  }
}
