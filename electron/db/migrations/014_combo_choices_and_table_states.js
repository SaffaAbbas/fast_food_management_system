/**
 * Migration 014: combo selectable choices + table out-of-service status support
 */
export const migration014 = {
  version: 14,
  name: 'combo_choices_and_table_states',
  up: (db) => {
    try {
      db.exec('ALTER TABLE combo_items ADD COLUMN choice_group TEXT;')
    } catch (e) {}
  },
}
