import { Capacitor } from "@capacitor/core";

export type DevicePosition = { latitude: number; longitude: number; accuracy: number };
export type LocationFailure = "denied" | "timeout" | "unavailable" | "unsupported";

export class LocationError extends Error {
  constructor(public readonly reason: LocationFailure) {
    super(reason);
  }
}

const browserPosition = (options: PositionOptions) => new Promise<GeolocationPosition>((resolve, reject) => {
  navigator.geolocation.getCurrentPosition(resolve, reject, options);
});

async function nativePosition(): Promise<DevicePosition> {
  const { Geolocation } = await import("@capacitor/geolocation");
  try {
    let permission = await Geolocation.checkPermissions();
    if (permission.location !== "granted" && permission.coarseLocation !== "granted") {
      permission = await Geolocation.requestPermissions();
    }
    if (permission.location !== "granted" && permission.coarseLocation !== "granted") throw new LocationError("denied");
    const { coords } = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
    return { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
  } catch (error) {
    if (error instanceof LocationError) throw error;
    // checkPermissions rejeita quando o serviço de localização do aparelho está desligado.
    throw new LocationError("unavailable");
  }
}

/** Posição atual do aparelho, sempre recém-obtida (nunca do cache do navegador). */
export async function getDevicePosition(): Promise<DevicePosition> {
  if (Capacitor.isNativePlatform()) return nativePosition();
  if (!("geolocation" in navigator)) throw new LocationError("unsupported");

  try {
    const { coords } = await browserPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 })
      .catch((error: GeolocationPositionError) => {
        if (error.code === error.PERMISSION_DENIED) throw error;
        return browserPosition({ enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 });
      });
    return { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
  } catch (error) {
    const code = (error as GeolocationPositionError).code;
    throw new LocationError(code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable");
  }
}

export const LOCATION_FAILURE_MESSAGES: Record<LocationFailure, string> = {
  denied: "Permissão de localização bloqueada. Libere o acesso nas configurações do aparelho.",
  timeout: "A localização demorou para responder. Tente novamente em um local com melhor sinal.",
  unavailable: "O aparelho não conseguiu determinar sua localização. Ative a localização precisa ou salve seu endereço.",
  unsupported: "Localização indisponível neste aparelho. Salve seu endereço para calcular as distâncias.",
};
