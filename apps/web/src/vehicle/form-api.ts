import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VehicleBody, VehiclePicture } from '@fleet-hub/shared';
import { api, ApiError } from '@/lib/api';
import { refreshMoney } from '@/money/api';

const enc = encodeURIComponent;

/** GET /vehicles/:serial/form: the stepper's values; never the start code, only whether one is set. */
export const useVehicleForm = (serial: string | null) =>
  useQuery({
    queryKey: ['vehicle-form', serial],
    queryFn: () =>
      api<{ values: VehicleBody; hasStartCode: boolean }>(`/vehicles/${enc(serial!)}/form`),
    enabled: !!serial,
    staleTime: 0,
    gcTime: 0,
  });

export interface SavedVehicle {
  id: string;
  serial: string;
  created: boolean;
  changed: string[];
}

export async function uploadPicture(serial: string, slot: VehiclePicture, file: File) {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch(`/api/vehicles/${enc(serial)}/pictures/${slot}`, {
    method: 'PUT',
    body: form,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? 'unknown');
  }
}

/** Saves the vehicle, then its picture changes; refreshes everything that shows vehicles. */
export function useSaveVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      serial,
      body,
      pictures,
    }: {
      serial: string | null;
      body: object;
      pictures: { slot: VehiclePicture; file: File | null }[];
    }) => {
      const saved = await api<SavedVehicle>(serial ? `/vehicles/${enc(serial)}` : '/vehicles', {
        method: serial ? 'PUT' : 'POST',
        json: body,
      });
      let pictureError: ApiError | null = null;
      for (const p of pictures) {
        try {
          if (p.file) await uploadPicture(saved.serial, p.slot, p.file);
          else await api(`/vehicles/${enc(saved.serial)}/pictures/${p.slot}`, { method: 'DELETE' });
        } catch (err) {
          pictureError = err instanceof ApiError ? err : new ApiError(0, 'unknown');
        }
      }
      return { saved, pictureError };
    },
    onSettled: () => refreshMoney(qc),
  });
}
