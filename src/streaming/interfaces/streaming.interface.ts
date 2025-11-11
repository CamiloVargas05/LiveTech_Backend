
export interface SesionStreaming {
  mantenimientoId: string;
  tecnicoSocketId: string;
  tecnicoId: string;
  usuarioSocketId: string | null;
  usuarioId: string;
  iniciadoEn: Date;
}

export interface MensajeChat {
  mantenimientoId: string;
  usuarioId: string;
  usuarioNombre: string;
  mensaje: string;
  timestamp: Date;
}

export interface DatosWebRTC {
  mantenimientoId: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}