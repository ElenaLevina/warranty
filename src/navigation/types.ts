/** Параметры маршрутов корневого стека (4 экрана из ТЗ §3). */
export type RootStackParamList = {
  Start: undefined;
  Settings: undefined;
  PlateCapture: undefined;
  /** Persistent capture screen (multi photo/video with a Фото/Видео toggle). */
  Capture: { caseId: string; initialMode?: 'photo' | 'video' };
  ActiveSession: { caseId: string };
  SessionComplete: { plate: string; photoCount: number; videoCount: number };
};
