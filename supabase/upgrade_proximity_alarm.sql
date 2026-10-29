-- AlertaVecinal: alarma por cercanía (ejecutar UNA VEZ en Supabase → SQL Editor).
-- No borra nada. Crea la función nearby_alerts que usa la app Android en segundo plano.
--
-- Qué hace: dada la posición del celular, devuelve las alertas ACTIVAS recientes que están
-- dentro de su radio (máx. 5 km). En "zonas calientes" (3 o más incidentes en 30 días a ~500 m)
-- el radio se amplía ×1.5. No incluye las alertas reportadas por el mismo usuario.
-- Privacidad: devuelve coordenadas REDONDEADAS (~110 m), nunca datos del reportante ni del texto.

create or replace function public.nearby_alerts(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 1.5,
  p_since timestamptz default (now() - interval '10 minutes'),
  p_exclude uuid default null
)
returns table (
  id uuid,
  category text,
  lat_approx double precision,
  lng_approx double precision,
  created_at timestamptz,
  distance_m integer,
  hot boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select least(greatest(coalesce(p_radius_km, 1.5), 0.2), 5.0) * 1000.0 as r_m,
           greatest(coalesce(p_since, now() - interval '10 minutes'), now() - interval '6 hours') as since_ts
  ),
  base as (
    select i.id, i.category, i.latitude, i.longitude, i.created_at,
           6371000.0 * 2 * asin(sqrt(
             power(sin(radians(i.latitude - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(i.latitude)) *
             power(sin(radians(i.longitude - p_lng) / 2), 2)
           )) as d
    from public.incidents i, params
    where p_lat between -90 and 90
      and p_lng between -180 and 180
      and i.latitude is not null and i.longitude is not null
      and i.status in ('Activa', 'Recibida', 'En camino')
      and i.created_at > params.since_ts
      and (p_exclude is null or i.reporter_id <> p_exclude)
  )
  select b.id,
         b.category,
         round(b.latitude::numeric, 3)::double precision,
         round(b.longitude::numeric, 3)::double precision,
         b.created_at,
         b.d::integer,
         h.hot
  from base b
  cross join params
  cross join lateral (
    select (count(*) >= 3) as hot
    from public.incidents x
    where x.latitude is not null and x.longitude is not null
      and x.created_at > now() - interval '30 days'
      and abs(x.latitude - b.latitude) < 0.0045
      and abs(x.longitude - b.longitude) < 0.0045
  ) h
  where b.d <= params.r_m * (case when h.hot then 1.5 else 1.0 end)
  order by b.created_at desc
  limit 20;
$$;

revoke all on function public.nearby_alerts(double precision, double precision, double precision, timestamptz, uuid) from public;
grant execute on function public.nearby_alerts(double precision, double precision, double precision, timestamptz, uuid) to anon, authenticated;

-- Prueba rápida (cambia las coordenadas por las de tu zona):
-- select * from public.nearby_alerts(-16.5000, -68.1500, 3, now() - interval '1 day');
