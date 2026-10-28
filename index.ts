// The app's entry (package.json "main"). It exists for ONE reason: the on-duty tracking task must be DEFINED on every start of
// the JavaScript bundle, not only when a screen is drawn. When the OS delivers a location to a swiped-away app it starts the
// bundle headlessly (no screens), looks up the task by name and runs it; if TaskManager.defineTask had not run by then the
// task would be "not defined" and the fix would be lost. So the collector is imported here, before the router starts.
//
// `@expo/metro-runtime` stays first, as in expo-router's own entry (it must be the first import for web Fast Refresh).
import '@expo/metro-runtime';
import './src/tracking/collector';
import 'expo-router/entry';
