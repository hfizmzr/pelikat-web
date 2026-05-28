-- ── RLS POLICIES ──────────────────────────────────────────────

-- ── ORGANIZERS ───────────────────────────────────────────────────
create policy "admin manages organizers" on organizers
  for all using (is_admin());

create policy "organizer reads own profile when expired" on organizers
  for select using (
    id = (auth.jwt() -> 'app_metadata' ->> 'organizer_id')::uuid
  );

-- ── EVENTS ───────────────────────────────────────────────────────
create policy "organizer reads own events" on events
  for select using (organizer_id = get_my_organizer_id() or is_admin());

create policy "organizer writes own events" on events
  for all using (organizer_id = get_my_organizer_id());

create policy "public reads published events" on events
  for select using (status = 'published');

-- ── RACE CATEGORIES ──────────────────────────────────────────────
create policy "organizer manages categories" on race_categories
  for all using (organizer_id = get_my_organizer_id());

create policy "runner sees categories for registered events" on race_categories
  for select using (
    event_id in (select event_id from registrations where runner_id = my_runner_id())
  );

-- ── RUNNER PROFILES ──────────────────────────────────────────────
create policy "runner reads own profile" on runner_profiles
  for select using (user_id = auth.uid());

create policy "runner updates own profile" on runner_profiles
  for update using (user_id = auth.uid());

create policy "runner inserts own profile" on runner_profiles
  for insert with check (user_id = auth.uid());

-- ── REGISTRATIONS ────────────────────────────────────────────────
create policy "runner reads own registrations" on registrations
  for select using (runner_id = my_runner_id());

create policy "runner creates own registrations" on registrations
  for insert to authenticated with check (
    runner_id = my_runner_id()
    and exists (
      select 1
      from events e
      where e.id = registrations.event_id
        and e.status = 'published'
    )
    and exists (
      select 1
      from race_categories c
      where c.id = registrations.category_id
        and c.event_id = registrations.event_id
    )
  );

create policy "organizer reads event registrations" on registrations
  for select using (
    event_id in (select id from events where organizer_id = get_my_organizer_id())
  );

create policy "organizer updates event registrations" on registrations
  for update using (organizer_id = get_my_organizer_id());

-- ── REPC CONSENT CODES ───────────────────────────────────────────
create policy "runner reads own consent codes" on repc_consent_codes
  for select using (
    registration_id in (select id from registrations where runner_id = my_runner_id())
  );

create policy "organizer manages consent codes" on repc_consent_codes
  for all using (organizer_id = get_my_organizer_id());

-- ── REPC COLLECTIONS ─────────────────────────────────────────────
create policy "organizer manages collections" on repc_collections
  for all using (organizer_id = get_my_organizer_id());

create policy "runner reads own collections" on repc_collections
  for select using (
    registration_id in (select id from registrations where runner_id = my_runner_id())
  );

-- ── PHOTO TAGS ───────────────────────────────────────────────────
create policy "runner sees own photos" on photo_tags
  for select using (
    bib_number in (
      select bib_number from registrations where runner_id = my_runner_id()
    )
  );

create policy "organizer sees own event photos" on photo_tags
  for select using (
    event_id in (select id from events where organizer_id = get_my_organizer_id())
  );

create policy "organizer updates own event photos" on photo_tags
  for update using (
    event_id in (select id from events where organizer_id = get_my_organizer_id())
  )
  with check (
    event_id in (select id from events where organizer_id = get_my_organizer_id())
  );

create policy "organizer inserts own event photos" on photo_tags
  for insert with check (
    event_id in (select id from events where organizer_id = get_my_organizer_id())
  );

-- ── RUN LOGS ─────────────────────────────────────────────────────
create policy "runner manages own run logs" on run_logs
  for all using (runner_id = my_runner_id());

-- ── RUNNER BADGES ────────────────────────────────────────────────
create policy "runner sees own badges" on runner_badges
  for select using (runner_id = my_runner_id());

-- ── MERCH PRODUCTS ───────────────────────────────────────────────
create policy "runner sees active products" on merch_products
  for select using (
    is_active = true and
    event_id in (select event_id from registrations where runner_id = my_runner_id())
  );

create policy "organizer manages own products" on merch_products
  for all using (
    event_id in (select id from events where organizer_id = get_my_organizer_id())
  );

-- ── MERCH VARIANTS ───────────────────────────────────────────────
create policy "runner sees variants" on merch_variants
  for select using (
    product_id in (
      select id from merch_products where event_id in (
        select event_id from registrations where runner_id = my_runner_id()
      )
    )
  );

create policy "organizer manages variants" on merch_variants
  for all using (
    product_id in (
      select id from merch_products where organizer_id = get_my_organizer_id()
    )
  );

-- ── MERCH ORDERS ─────────────────────────────────────────────────
create policy "runner reads own orders" on merch_orders
  for select using (runner_id = my_runner_id());

create policy "runner inserts own order" on merch_orders
  for insert with check (runner_id = my_runner_id());

create policy "organizer reads own event orders" on merch_orders
  for select using (organizer_id = get_my_organizer_id());

-- ── MERCH ORDER ITEMS ────────────────────────────────────────────
create policy "runner reads own order items" on merch_order_items
  for select using (
    order_id in (select id from merch_orders where runner_id = my_runner_id())
  );

create policy "organizer reads own event order items" on merch_order_items
  for select using (
    order_id in (select id from merch_orders where organizer_id = get_my_organizer_id())
  );

-- ── AUDIT LOG ────────────────────────────────────────────────────
create policy "admin reads audit log" on audit_log
  for select using (is_admin());
