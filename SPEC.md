This program is a CLI tool which uses the Notion to help migrate pages between two databases


Tech stack
- @notionhq/client
- [ink](https://github.com/vadimdemedes/ink)
- [ink-select-input](https://github.com/vadimdemedes/ink-select-input)
- Typescript

Subcommands:
- `test-connection`: tests the connection to the Notion API, and that the databases can be accessed
- `schema tasks`: Display or save schema of the Task database 
- `schema projects`: Display or save schema of the Project database

# Migration Process Steps

## Step 0: Create test project "create-test-project"
- Creates a test project in Tasks database with properties:
  - Name: "Test Migration Project - [timestamp]"
  - Task/project/activity: "Project" 
  - Status: "Done"
  - Deadline: 1 march 2025
  - In charge: Lucie Philippon (TODO: add id)
  - Supervisor: Florent Berther (TODO: add id)
  - Projects: "Separate tasks db" (TODO: add id)
- Creates 2 test subtask that references the project via "Parent item" relation

## Step 1: Validation "check-eligible-project"
- Retrieve project page by its id and store it in state
- Check
    - In the task database
    - Status: "Done" or "Cancelled"
    - Project type must be "Project" (Task/project/activity = "Project")
    - Project must have no Parent item (root-level project only)
    - Project subtask relation must not have `has_more: true` (pagination limit check)
        - TODO: handle projects with more tasks than displayed in relation
- Display the URL to the page and a summary of the page (title, in charge, status)
- Prompt: continue with migration?

## Step 2: Check only one person in charge `check-in-charge`
- Check that project has only one person in "In charge"
- If more than one, prompt user to choose which one will stay in charge
    - Set in charge to the person selected
    - Add the other the the Participants property (careful not to remove the existing ones)
- Else, move to next step

## Step 3: Save Parent Projects Relations (`save-parent-project-relations`)
- Reads current "Projects" relation from the task
- Saves project IDs to "Parent projects to transfer" field for later restoration
- Error if "Parent projects to transfer" is already filled
- Display titles of projects saved

### Step 4: Save Subtasks Relations (`save-subtasks-relations`)
- Reads all subtasks from project's "Subtask" relation property
- Stores comma-separated subtask IDs in "Subtasks to transfer" field
- Clears the "Subtask" relation (sets to empty array) to prevent subtasks from being moved to the new DB

**Validation Checks**:
- Aborts if `has_more: true` in subtask relation (too many subtasks for API pagination)
- Provides clear error message directing user to reduce subtasks before migration

### Step 5: Manual Database Move (`await-manual-move`)
**Purpose**: Instruct user to manually move page between databases
**Type**: User instruction + prompt
**Instructions**: 
- User must manually drag the project page from Tasks database to Projects database in Notion UI
- Provides the project URL for easy access
**User Options**:
- `C`: Continue to verification → proceeds to `verifying`

### Step 6: Verify Database Move (`verifying`)
**Purpose**: Confirm the page was successfully moved to Projects database
**Type**: Automatic
**Operations**:
- Retrieves the page and checks its parent database ID
- Compares against expected Projects database ID
- **Success**: Page is in Projects database → proceeds to `moved`
- **Failure**: Page still in wrong database → returns to `await-manual-move`

### Step 7: Move Confirmed (`moved`)
**Purpose**: Confirm successful move and offer property updates
**Type**: User prompt
**Display**: Shows the moved page URL and confirms successful database transfer
**User Options**:
- `Y`: Update properties for Projects database → proceeds to `updating`
- `N`: Skip property updates → jumps to `complete`

### Step 8: Update Properties (`updating`)
**Purpose**: Transform properties for Projects database schema
**Type**: Automatic
**Property Transformations**:
- **Status mapping**: "Done" → "Completed", "Cancelled" → "Cancelled"  
- **Property renames**:
  - "Task/project/activity" → "Type"
  - "Importance" → "Impact" 
  - "Comments & updates" → "Comments"
  - "In charge" → "Owner" (only if single person)
  - "Deadline" → "Start and end dates (approximate)"
- **Parent project restoration**: Reads "Parent projects to transfer" field and restores connections to "Parent item" relation
- **Transfer field cleanup**: Moves transfer data to "à transférer (to delete)" field with completion timestamp
- **Subtask connection restoration**: Calls `restoreSubtaskConnections()` to re-link subtasks to moved project

**Subtask Restoration Process**:
- Reads "Subtasks to transfer" field with stored subtask IDs
- For each subtask ID, adds the new project ID to the subtask's "Projects" relation
- Avoids duplicate connections
- Clears "Subtasks to transfer" field after processing
- **Critical**: If subtask restoration fails, entire migration is marked as failed

### Step 9: Migration Complete (`complete`)
**Purpose**: Display final results and completion status
**Type**: Display + exit prompt
**Display**: 
- Shows final migrated page URL
- Displays property update results
- Shows completion status
**User Options**:
- `Enter` or `Q`: Exit application

### Step 10: Error Handling (`error`)
**Purpose**: Display errors and allow user to exit
**Type**: Display + exit prompt
**Display**: Shows error message with details
**User Options**:
- `Enter` or `Q`: Exit application



## Migration Flow Summary

```
init → created → [Y] → saving-relations → handling-subtasks → await-manual-move → [C] → verifying → moved → [Y] → updating → complete
  ↓       ↓                                                                                        ↓       ↓
error   [N] → complete                                                                          [N] → complete
```

## Key Safety Features

1. **Validation First**: Projects are validated before any changes are made
2. **Subtask Protection**: Subtask relations are cleared to prevent accidental migration
3. **Relationship Preservation**: Parent projects and subtasks are tracked and restored
4. **Atomic Operations**: Failed subtask restoration causes entire migration to fail
5. **User Control**: Manual database move ensures user oversight of the critical step
6. **Rollback Information**: Transfer fields preserve original relationship data

## Migrating properties (generated by claude)

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

## Migration Process Steps (description generated by claude)

The migration follows a structured step-by-step process with validation, user prompts, and automatic operations:

### Step 1: Initialization (`init`)
**Purpose**: Create test data and initialize migration process
**Type**: Automatic
**Operations**:
- Creates a test project in Tasks database with properties:
  - Name: "Test Migration Project - [timestamp]"
  - Task/project/activity: "Project" 
  - Status: "Done"
  - Duration, Cost, Team, etc. (sample values)
- Creates a test subtask that references the project via "Parent item" relation
- Validates the created project meets migration requirements

**Validation Checks**:
- Project type must be "Project" (Task/project/activity = "Project")
- Project must have no Parent item (root-level project only)
- Project subtask relation must not have `has_more: true` (pagination limit check)

### Step 2: Project Created Confirmation (`created`)
**Purpose**: Display created test data and get user confirmation
**Type**: User prompt
**Display**: Shows created project and subtask details with URLs
**User Options**:
- `Y`: Continue with migration → proceeds to `saving-relations`
- `N`: Cancel migration → jumps to `complete`

### Step 3: Save Parent Relations (`saving-relations`)
**Purpose**: Preserve existing project relationships before migration  
**Type**: Automatic
**Operations**:
- Reads current "Projects" relation from the task
- Saves project URLs to "Parent projects to transfer" field for later restoration
- Handles cases where no Projects relation exists

### Step 4: Handle Subtask Connections (`handling-subtasks`)
**Purpose**: Prepare subtask relationships for migration
**Type**: Automatic
**Operations**:
- Reads all subtasks from project's "Subtask" relation property
- Stores comma-separated subtask IDs in "Subtasks to transfer" field
- **Clears the "Subtask" relation** (sets to empty array) to prevent auto-migration of subtasks
- This ensures subtasks stay in Tasks database while project moves to Projects database

**Validation Checks**:
- Aborts if `has_more: true` in subtask relation (too many subtasks for API pagination)
- Provides clear error message directing user to reduce subtasks before migration

### Step 5: Manual Database Move (`await-manual-move`)
**Purpose**: Instruct user to manually move page between databases
**Type**: User instruction + prompt
**Instructions**: 
- User must manually drag the project page from Tasks database to Projects database in Notion UI
- Provides the project URL for easy access
**User Options**:
- `C`: Continue to verification → proceeds to `verifying`

### Step 6: Verify Database Move (`verifying`)
**Purpose**: Confirm the page was successfully moved to Projects database
**Type**: Automatic
**Operations**:
- Retrieves the page and checks its parent database ID
- Compares against expected Projects database ID
- **Success**: Page is in Projects database → proceeds to `moved`
- **Failure**: Page still in wrong database → returns to `await-manual-move`

### Step 7: Move Confirmed (`moved`)
**Purpose**: Confirm successful move and offer property updates
**Type**: User prompt
**Display**: Shows the moved page URL and confirms successful database transfer
**User Options**:
- `Y`: Update properties for Projects database → proceeds to `updating`
- `N`: Skip property updates → jumps to `complete`

### Step 8: Update Properties (`updating`)
**Purpose**: Transform properties for Projects database schema
**Type**: Automatic
**Property Transformations**:
- **Status mapping**: "Done" → "Completed", "Cancelled" → "Cancelled"  
- **Property renames**:
  - "Task/project/activity" → "Type"
  - "Importance" → "Impact" 
  - "Comments & updates" → "Comments"
  - "In charge" → "Owner" (only if single person)
  - "Deadline" → "Start and end dates (approximate)"
- **Parent project restoration**: Reads "Parent projects to transfer" field and restores connections to "Parent item" relation
- **Transfer field cleanup**: Moves transfer data to "à transférer (to delete)" field with completion timestamp
- **Subtask connection restoration**: Calls `restoreSubtaskConnections()` to re-link subtasks to moved project

**Subtask Restoration Process**:
- Reads "Subtasks to transfer" field with stored subtask IDs
- For each subtask ID, adds the new project ID to the subtask's "Projects" relation
- Avoids duplicate connections
- Clears "Subtasks to transfer" field after processing
- **Critical**: If subtask restoration fails, entire migration is marked as failed

### Step 9: Migration Complete (`complete`)
**Purpose**: Display final results and completion status
**Type**: Display + exit prompt
**Display**: 
- Shows final migrated page URL
- Displays property update results
- Shows completion status
**User Options**:
- `Enter` or `Q`: Exit application

### Step 10: Error Handling (`error`)
**Purpose**: Display errors and allow user to exit
**Type**: Display + exit prompt
**Display**: Shows error message with details
**User Options**:
- `Enter` or `Q`: Exit application

## Migration Flow Summary

```
init → created → [Y] → saving-relations → handling-subtasks → await-manual-move → [C] → verifying → moved → [Y] → updating → complete
  ↓       ↓                                                                                        ↓       ↓
error   [N] → complete                                                                          [N] → complete
```

## Key Safety Features

1. **Validation First**: Projects are validated before any changes are made
2. **Subtask Protection**: Subtask relations are cleared to prevent accidental migration
3. **Relationship Preservation**: Parent projects and subtasks are tracked and restored
4. **Atomic Operations**: Failed subtask restoration causes entire migration to fail
5. **User Control**: Manual database move ensures user oversight of the critical step
6. **Rollback Information**: Transfer fields preserve original relationship data