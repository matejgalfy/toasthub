-- Reference data every environment needs. Keep the setting values in step with APP_SETTING_DEFAULTS
-- (packages/shared/src/settings.ts); migrate.int.test.ts checks that they match.
INSERT INTO "app_setting" ("key", "value") VALUES
	('flag_daily_threshold', '8'),
	('clan_max_members', '10')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- Placeholder facts until SPEC §14 Q3 (who writes the real list) is answered. The id order is the rotation
-- order, so replace them in a new migration rather than editing this one.
INSERT INTO "toast_fact" ("text_sk", "text_en") VALUES
	('Hnedú farbu a chuť dostáva toast vďaka Maillardovej reakcii medzi cukrami a aminokyselinami.',
	 'Toast gets its brown colour and flavour from the Maillard reaction between sugars and amino acids.'),
	('Prvý vyskakovací elektrický hriankovač si dal patentovať Charles Strite v roku 1921.',
	 'Charles Strite patented the first pop-up electric toaster in 1921.'),
	('Krájaný chlieb sa začal predávať v roku 1928 a opekanie sa tým veľmi zjednodušilo.',
	 'Sliced bread went on sale in 1928, which made toasting a lot easier.'),
	('Slovo „toast“ pochádza z latinského „tostus“, čo znamená opražený.',
	 'The word "toast" comes from the Latin "tostus", meaning scorched.'),
	('Prípitok sa po anglicky povie „toast“, vraj podľa zvyku vkladať do vína korenistý opečený chlieb.',
	 'Raising a glass is called a "toast", reportedly after the old habit of dropping spiced toast into wine.'),
	('Stojan na toasty drží krajce zvislo, aby z nich unikla para a zostali chrumkavé.',
	 'A toast rack keeps slices upright so the steam escapes and they stay crisp.'),
	('Melba toast je pomenovaný po austrálskej opernej speváčke Nellie Melbe.',
	 'Melba toast is named after the Australian opera singer Nellie Melba.'),
	('Vo Francúzsku sa francúzskemu toastu hovorí „pain perdu“, stratený chlieb, lebo zachráni starý chlieb.',
	 'In France, French toast is "pain perdu", lost bread, because it rescues stale bread.'),
	('Maillardova reakcia, ktorá chlieb opeká dohneda, sa naplno rozbieha zhruba od 140 °C.',
	 'The Maillard reaction that browns your bread really gets going from about 140 °C.'),
	('Bruschetta je vlastne opečený chlieb potretý cesnakom a olivovým olejom.',
	 'Bruschetta is simply toasted bread rubbed with garlic and olive oil.');
