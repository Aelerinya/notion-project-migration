This program is a CLI tool which uses the Notion to help migrate pages between two databases


Tech stack
- @notionhq/client
- [ink](https://github.com/vadimdemedes/ink)
- Typescript

Subcommands:
- `test-connection`: tests the connection to the Notion API, and that the databases can be accessed
- `schema tasks`: Display or save schema of the Task database 
- `schema projects`: Display or save schema of the Project database

## Migration

The goal is to migrate existing projects from the Tasks database to the Projects database. Below is the mapping from Task properties to Project properties:

### Direct Mappings (Same Name)
These properties have the same name in both databases:
- `Name` (title) → `Name` (title)
- `Status` → `Status` (with status value mapping needed)
- `Supervisor` → `Supervisor` 
- `Participants` → `Participants`
- `Event` → `Event`
- `Duration (h)` → `Duration (h)`
- `Cost (k€)` → `Cost (k€)`
- `Type of publication` → `Type of publication`
- `Scheduled for` → `Scheduled for`
- `Last edited time` → `Last edited time`
- `Finished on` → `Finished on`
- `€ Explanation` → `€ Explanation`
- `V explanation` → `V explanation` 
- `V override (k€)` → `V override (k€)`
- `% V project` → `% V project`
- `Team` → `Team`
- `Achievement` → `Achievement`
- `(old) Project` → `(old) Project`
- `Volunteers needed` → `Volunteers needed`

### Property Name Changes
These properties need to be renamed during migration:
- `In charge` (Tasks) → `Owner` (Projects) - **Only if single person in "In charge"**
- `Comments & updates` (Tasks) → `Comments` (Projects)
- `Task/project/activity` (Tasks) → `Type` (Projects)
- `Importance` (Tasks) → `Impact` (Projects) (with star rating mapping)
- `Deadline` (Tasks) → `Start and end dates (approximate)` (Projects)

### Tasks-Specific Properties (Ignored During Migration)
These properties exist only in Tasks database and are **IGNORED** during migration:
- `Description si volunteers needed` - Could map to `Description of missions for volunteers` (manual)
- `Bloque` / `Bloqué par` - Self-referencing task blocking relationships (ignored)
- `V/€` - **Formula field (ignored)**
- `Deadline setter` - Priority/urgency mapping (ignored)
- `V/h` - **Formula field (ignored)**
- `Parent item` / `Subtask` - Task hierarchy relationships (ignored)
- `Milestone` - Checkpoint tracking (ignored)
- `Final Value (k€)` - **Formula field (ignored)**
- `Projects` - Relation to Projects database (reverse relation, ignored)
- `Creation time` / `Created by` - Audit fields (ignored)
- `Last status change` - Status tracking (ignored)  
- `Statut éditorial` - Editorial status (ignored)

### Projects-Specific Properties (New)
These properties exist only in Projects database:
- `Owner` - Project ownership
- `Workstream` - Primary workstream assignment
- `Sub-item` / `Parent item` - Project hierarchy
- `Master google doc` - Documentation link
- `Progress to end date` - Formula for progress calculation
- `Type` - Project vs Activity classification
- `Start and end dates (approximate)` - Main project timeline
- `History` - Project review history
- `Planning` - Recurring objectives & KPIs
- `Ok pour bdd bénévoles` - Volunteer database flag
- `Bénévoles dans l'équipe` - Team volunteer flag
- `Start and end dates (approximate possible)` - Alternative timeline
- `Description of project` - Project description
- `Description of missions for volunteers` - Volunteer mission details
- `à transférer (to delete)` - Migration cleanup field

### Status Mapping & Filtering
**CRITICAL**: Only migrate entries with specific status values. **SKIP all other entries**.

**Migrate these statuses:**
- `Done` → `Completed`
- `Cancelled` → `Cancelled` (no change)

**Skip all other statuses** (entries will not be migrated):
- `Today` - SKIP
- `Maybe today` - SKIP  
- `Todo` - SKIP
- `On hold` - SKIP
- `Coming` - SKIP
- `To be evaluated` - SKIP
- `Ongoing` - SKIP
- `To be proofread` - SKIP
- `Recurring` - SKIP

### Migration Strategy
1. **Filter Tasks**: Only migrate tasks marked as projects (`Task/project/activity` = "Project")
2. **Status Filtering**: Only migrate entries with status `Done` or `Cancelled` - **SKIP all others**
3. **Property Mapping**: Apply direct mappings and rename properties as specified
4. **Special Rules**:
   - `Owner` = `In charge` (only if single person)
   - `Type` = `Task/project/activity` value
   - `Deadline` → `Start and end dates (approximate)`
   - **All formula fields ignored**
5. **Status Conversion**: 
   - `Done` → `Completed`
   - `Cancelled` → `Cancelled` (unchanged)
6. **Manual Review**: Complex mappings may require manual review