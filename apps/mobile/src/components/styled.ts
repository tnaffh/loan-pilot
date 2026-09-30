import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { KeyboardAwareScrollView as KCKeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { withUniwind } from 'uniwind';

/**
 * Third-party views taught to accept `className` (core RN views already do).
 * `withUniwind` also maps `contentContainerStyle` → `contentContainerClassName`.
 */
export const LinearGradient = withUniwind(ExpoLinearGradient);
export const Image = withUniwind(ExpoImage);
export const KeyboardAwareScrollView = withUniwind(KCKeyboardAwareScrollView);
