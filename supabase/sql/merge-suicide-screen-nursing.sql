-- Merge duplicate suicide cases: Nursing screen == BSSA / SAFE-T assessment.
-- Keep SimBox_Suicide_Assessment_BSSA_SAFE-T (has events); retire SimBox_Suicide_Screen_Nursing.

update public.cases
set
  display_name = 'SimBox Suicide Screen (Nursing / BSSA SAFE-T)',
  active = true,
  app_version = coalesce(nullif(app_version, ''), '1.0.0')
where case_key = 'SimBox_Suicide_Assessment_BSSA_SAFE-T';

-- Nursing has no events in production; remove the duplicate row.
delete from public.cases
where case_key = 'SimBox_Suicide_Screen_Nursing'
  and not exists (
    select 1 from public.case_events e where e.case_id = cases.id
  );

-- If Nursing somehow gained events, reassign them then deactivate.
do $$
declare
  nursing_id uuid;
  assessment_id uuid;
begin
  select id into nursing_id from public.cases where case_key = 'SimBox_Suicide_Screen_Nursing';
  select id into assessment_id from public.cases where case_key = 'SimBox_Suicide_Assessment_BSSA_SAFE-T';
  if nursing_id is not null and assessment_id is not null then
    update public.case_events set case_id = assessment_id where case_id = nursing_id;
    delete from public.cases where id = nursing_id;
  end if;
end $$;
