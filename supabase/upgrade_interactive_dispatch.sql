-- AlertaVecinal: seguimiento de intervención policial sobre mapa (incremental).
-- Ejecutar UNA VEZ en Supabase SQL Editor, SIN borrar las tablas anteriores.
-- El incidente conserva el punto que eligió el vecino en incidents.latitude/longitude.

CREATE TABLE IF NOT EXISTS public.incident_responses (
  incident_id uuid PRIMARY KEY REFERENCES public.incidents(id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  response_status text NOT NULL DEFAULT 'En camino'
      CHECK (response_status IN ('En camino','Atendida','Finalizada')),
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  accuracy_m double precision CHECK (accuracy_m IS NULL OR accuracy_m BETWEEN 0 AND 100000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incident_responses_officer_idx ON public.incident_responses(officer_id);

-- Siempre usar hora del servidor y evitar falsear el identificador del policía.
CREATE OR REPLACE FUNCTION public.prepare_incident_response()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.updated_at=now();
  IF TG_OP='UPDATE' AND NEW.officer_id IS DISTINCT FROM OLD.officer_id THEN
    RAISE EXCEPTION 'No se puede cambiar el policía asignado mediante una actualización';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS incident_response_updated ON public.incident_responses;
CREATE TRIGGER incident_response_updated BEFORE INSERT OR UPDATE ON public.incident_responses
FOR EACH ROW EXECUTE FUNCTION public.prepare_incident_response();

ALTER TABLE public.incident_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS response_read_visible_incident ON public.incident_responses;
DROP POLICY IF EXISTS response_police_insert ON public.incident_responses;
DROP POLICY IF EXISTS response_police_update_own ON public.incident_responses;

-- Se puede conocer la respuesta policial solo si el usuario puede leer el incidente.
CREATE POLICY response_read_visible_incident ON public.incident_responses
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.incidents i WHERE i.id=incident_id)
);
-- El rol policial solo puede iniciar una intervención para incidentes que puede consultar.
CREATE POLICY response_police_insert ON public.incident_responses
FOR INSERT TO authenticated WITH CHECK (
  officer_id=auth.uid() AND public.current_app_role()='policia'
  AND EXISTS (SELECT 1 FROM public.incidents i WHERE i.id=incident_id)
);
CREATE POLICY response_police_update_own ON public.incident_responses
FOR UPDATE TO authenticated USING (
  officer_id=auth.uid() AND public.current_app_role()='policia'
) WITH CHECK (
  officer_id=auth.uid() AND public.current_app_role()='policia'
);

-- Compartir cambios de posición entre la web y Android cuando están abiertos.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_responses;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

-- Mejora recomendada para los reportes NUEVOS: su coordenada debe existir.
-- No imponemos NOT NULL a registros antiguos: algunos ya fueron guardados sin GPS.
-- La aplicación actualizada bloquea publicar nuevos incidentes sin punto elegido.

-- Mantener visibles a los vecinos las alertas atendidas/resueltas en el mapa,
-- con el icono de estado verde (las falsas alarmas quedan restringidas al autor).
DROP POLICY IF EXISTS "incidents_read_authenticated" ON public.incidents;
CREATE POLICY "incidents_read_authenticated" ON public.incidents
FOR SELECT TO authenticated USING (
 public.is_admin()
 OR (public.current_app_role()='policia' AND (station_id=public.current_station_id() OR station_id IS NULL))
 OR (public.current_app_role()='vecino' AND
     (status IN ('Activa','Recibida','En camino','Atendida','Resuelta') OR reporter_id=auth.uid()))
);

-- Comprobación:
-- SELECT i.report_code,i.category,i.latitude,i.longitude,i.status,r.response_status,r.latitude AS police_latitude,r.longitude AS police_longitude
-- FROM public.incidents i LEFT JOIN public.incident_responses r ON r.incident_id=i.id ORDER BY i.created_at DESC;
