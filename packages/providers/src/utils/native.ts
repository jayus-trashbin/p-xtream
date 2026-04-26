export const isReactNative = () => {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
};

