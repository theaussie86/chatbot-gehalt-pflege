-- Seed: DRK Lübeck Test Project Configuration
-- This migration inserts a test project with the full DRK Lübeck bonus configuration
-- Run after: 20260311000000_add_bonus_config.sql

-- Note: You may need to adjust the user_id to match an existing user in your database
-- For local testing, you can comment out the user_id or use a test user

-- First, check if the project already exists (idempotent migration)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM projects WHERE public_key = 'drk-luebeck-test') THEN
        INSERT INTO projects (
            name,
            public_key,
            allowed_origins,
            bonus_config
        ) VALUES (
            'DRK Schwesternschaft Lübeck (Test)',
            'drk-luebeck-test',
            ARRAY['http://localhost:3000', 'http://localhost:5173']::text[],
            '{
                "employer": {
                    "name": "DRK Schwesternschaft Lübeck",
                    "greeting": "Vielen Dank, dass du dich bei uns bewerben möchtest! Ich bin der Chatbot vom DRK Lübeck und möchte dir helfen, dein tatsächliches Gehalt (inkl. aller Zulagen) zu berechnen.",
                    "tarif": "tvoed"
                },
                "features": {
                    "collectShiftData": true,
                    "collectQualifications": true,
                    "showOneTimeBonuses": true
                },
                "allowances": {
                    "shiftChange": { "fullShift": 155, "partialShift": 105 },
                    "night": { "percentage": 25 },
                    "sunday": { "percentage": 50 },
                    "holiday": { "percentage": 125 }
                },
                "bonuses": {
                    "jumpIn": { "weekday": 60, "weekend": 90 },
                    "performance": {
                        "lateShift": { "threshold": 7, "amount": 250, "assistantAmount": 125 },
                        "nightShift": { "threshold": 5, "amount": 250, "assistantAmount": 125 },
                        "extraNight": { "startFrom": 6, "amountPerNight": 50, "assistantAmountPerNight": 25 }
                    },
                    "qualifications": {
                        "wundmanager": 130,
                        "palliativbegleiter": 130,
                        "zercur_geriatrie": 130,
                        "praxisanleiter": 230
                    },
                    "oneTime": {
                        "switchBonus": { "total": 2500, "schedule": "1.000€ nach 12 Monaten, 1.500€ nach 18 Monaten" },
                        "welcomeBonus": { "total": 3500, "schedule": "1.000€ / 1.250€ / 1.250€ über 24 Monate" }
                    }
                }
            }'::jsonb
        );
        RAISE NOTICE 'Created DRK Lübeck test project with bonus_config';
    ELSE
        -- Update existing project with the bonus_config
        UPDATE projects
        SET bonus_config = '{
            "employer": {
                "name": "DRK Schwesternschaft Lübeck",
                "greeting": "Vielen Dank, dass du dich bei uns bewerben möchtest! Ich bin der Chatbot vom DRK Lübeck und möchte dir helfen, dein tatsächliches Gehalt (inkl. aller Zulagen) zu berechnen.",
                "tarif": "tvoed"
            },
            "features": {
                "collectShiftData": true,
                "collectQualifications": true,
                "showOneTimeBonuses": true
            },
            "allowances": {
                "shiftChange": { "fullShift": 155, "partialShift": 105 },
                "night": { "percentage": 25 },
                "sunday": { "percentage": 50 },
                "holiday": { "percentage": 125 }
            },
            "bonuses": {
                "jumpIn": { "weekday": 60, "weekend": 90 },
                "performance": {
                    "lateShift": { "threshold": 7, "amount": 250, "assistantAmount": 125 },
                    "nightShift": { "threshold": 5, "amount": 250, "assistantAmount": 125 },
                    "extraNight": { "startFrom": 6, "amountPerNight": 50, "assistantAmountPerNight": 25 }
                },
                "qualifications": {
                    "wundmanager": 130,
                    "palliativbegleiter": 130,
                    "zercur_geriatrie": 130,
                    "praxisanleiter": 230
                },
                "oneTime": {
                    "switchBonus": { "total": 2500, "schedule": "1.000€ nach 12 Monaten, 1.500€ nach 18 Monaten" },
                    "welcomeBonus": { "total": 3500, "schedule": "1.000€ / 1.250€ / 1.250€ über 24 Monate" }
                }
            }
        }'::jsonb
        WHERE public_key = 'drk-luebeck-test';
        RAISE NOTICE 'Updated existing DRK Lübeck test project with bonus_config';
    END IF;
END $$;

-- Verify the configuration was inserted correctly
-- SELECT name, public_key, bonus_config FROM projects WHERE public_key = 'drk-luebeck-test';
