
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
  usuarioEmail?: string; // ← Agregar
  mensaje: string;
  timestamp: Date;
  clientId?: string; // ← Agregar
}
export interface DatosWebRTC {
  mantenimientoId: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}