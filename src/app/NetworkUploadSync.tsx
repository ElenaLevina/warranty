/**
 * NetworkUploadSync — retries the upload queue whenever the device regains
 * connectivity (ТЗ §6: offline files are sent automatically when the network
 * is back). Renders nothing.
 */
import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useSessionActions } from '../store/StoreProvider';

export function NetworkUploadSync(): null {
  const actions = useSessionActions();
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected === true) {
        actions.processUploads().catch(() => undefined);
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
