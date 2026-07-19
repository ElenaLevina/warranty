/** Параметры маршрутов корневого стека (4 экрана из ТЗ §3). */
export type RootStackParamList = {
  Start: undefined;
  Settings: undefined;
  /** Admin-only: list of provisioned users. */
  Users: undefined;
  /** Admin-only: create (no id) or edit (with id) a user. */
  UserEdit: { userId?: string };
  /** Mandatory first step: scan the 6-digit repair-order number. */
  OrderCapture: undefined;
  /** Plate scan; requires the confirmed order number from the previous step. */
  PlateCapture: { orderNumber: string };
  /** Persistent capture screen (multi photo/video with a Фото/Видео toggle). */
  Capture: { caseId: string; initialMode?: 'photo' | 'video' };
  ActiveSession: { caseId: string };
  /** Full-screen media viewer (open session only); photos can be annotated. */
  MediaViewer: { caseId: string; fileName: string; fileType: 'photo' | 'video' };
  SessionComplete: {
    plate: string;
    photoCount: number;
    videoCount: number;
    orderNumber?: string;
  };
};
