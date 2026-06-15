-- Allow a runner to send a mislabeled gallery photo back to organizer review.

create or replace function public.runner_request_photo_review(
  p_event_id uuid,
  p_photo_tag_id uuid
)
returns table (
  success boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_runner_id uuid;
  v_photo_tag_id uuid;
begin
  v_runner_id := public.my_runner_id();

  if v_runner_id is null then
    return query select false, 'Runner profile not found.'::text;
    return;
  end if;

  select pt.id
  into v_photo_tag_id
  from public.photo_tags pt
  where pt.id = p_photo_tag_id
    and pt.event_id = p_event_id
    and pt.runner_id = v_runner_id
    and pt.status in ('auto', 'confirmed')
  limit 1;

  if v_photo_tag_id is null then
    return query select false, 'This photo is no longer available in your gallery.'::text;
    return;
  end if;

  update public.photo_tags
  set
    status = 'review',
    registration_id = null,
    runner_id = null
  where id = v_photo_tag_id
    and event_id = p_event_id;

  return query select true, 'Photo sent back to organizer review.'::text;
end;
$$;

grant execute on function public.runner_request_photo_review(uuid, uuid) to authenticated;
