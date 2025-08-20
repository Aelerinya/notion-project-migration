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

# Command `create-test-project`
- Creates a test project in Tasks database with properties:
  - Name: "Test Migration Project - [timestamp]"
  - Task/project/activity: "Project" 
  - Status: "Done"
  - Deadline: 1 march 2025
  - Duration (h): 10
  - Cost (k€): 5
  - In charge: Lucie Philippon (ID: 9494ea4b-765a-4eac-9cc2-39feef9c4bb7)
  - Supervisor: Florent Berthet (ID: 6d25e541-6b16-41c1-be36-8c2f548f0f36)
  - Importance: ⭐⭐⭐⭐
  - Team: R&D
  - Comments & updates: "Test migration project created for database migration testing purposes."
  - Projects: "Separate tasks db" (ID: 23f66ef02bab80d7b205d1b31f3aad2e)
  - Migration status: "Project to migrate"
- Creates 2 test subtasks that reference the project via "Parent item" relation:
  - Subtask 1: Duration 2h, Cost 0.5k€, Team R&D
  - Subtask 2: Duration 1.5h, Cost 0.3k€, Team R&D

# New migration proposal

Each step will be a different subcommand of the `migrate` command

## Step 1: Validation and display `initial-validation`
- Target: All Tasks where `Migration status` is `Project to migrate`
- Check
    - In the task database
    - Status: "Done" or "Cancelled"
    - Project type must be "Project" (Task/project/activity = "Project")
    - Project must have no Parent item (root-level project only)
    - Project subtask relation must not have `has_more: true` (pagination limit check)
        - TODO: handle projects with more tasks than displayed in relation
- Display the URL to the page and a summary of the page (title, in charge, status)

## Step 2: Check only one person in charge `fix-in-charge`
- Target: All Tasks where `Migration status` is `Project to migrate`
- Check that project has only one person in "In charge"
- If more than one, prompt user to choose which one will stay in charge
    - Set in charge to the person selected
    - Add the other the the Participants property (careful not to remove the existing ones)

## Step 3: Save Parent Projects Relations (`save-parent-project-relations`)
- Target: All Tasks where `Migration status` is `Project to migrate`
- Reads current "Projects" relation from the task
- Saves project IDs to "Parent projects to transfer" field for later restoration
- If no project, do nothing. keep Parent projects to transfer as is
- Error if "Parent projects to transfer" is already filled
- Display titles of parent projects saved for each project

## Step 4: Save Subtasks Relations (`save-subtasks-relations`)
- Target: All Tasks where `Migration status` is `Project to migrate`
- Check again that all project has `has_more` to false in subtask property. if not, abort
- Reads all subtasks from project's "Subtask" relation property
- Stores comma-separated subtask IDs in "Subtasks to transfer" field
- For each subtask
  - set their `Migration status` is `Subtask to relink`
  - set `Parent projects to transfer` to the id of the project
- If no subtasks, do nothing. keep Subtasks to transfer as is
- Display titles of subtasks edited of all projects

## Step 5: Remove substasks relations `remove-subtasks`
- Target: All Tasks where `Migration status` is `Project to migrate`
- Clears the "Subtask" relation (sets to empty array)
  - INFO: this prevent subtasks from being moved to the new DB

## Manual step: moving the projects in the notion UI

## Step 6: Verify Database Move `verify-move`
- Target: All `Projects` (project DB) where `Migration status` is `Project to migrate`
- Display all the projects title and count

## Step 7: Update props (`post-move-update`)
- Target: All `Projects` (project DB) where `Migration status` is `Project to migrate`
**Property Transformations**:
- **Status mapping**: "Done" → "Completed", "Cancelled" → "Cancelled"  
- **Property renames**: copy value from old column to new column
  - "Task/project/activity" → "Type"
  - "Importance" → "Impact" 
  - "Comments & updates" → "Comments"
  - "In charge" → "Owner" (only if single person)
  - "Deadline" → "Start and end dates (approximate)"

## Step 8: Relink parent projects `relink-parent-projects`
- Target: All `Projects` (project DB) where `Migration status` is `Project to migrate`
- Reads "Parent projects to transfer" field for the list of parent project IDs, and restores connections in "Parent item" relation
- Display project and their relink connections

## Step 9: Relink subtasks `relink-subtasks`
- Target: All `Projects` (project DB) where `Migration status` is `Project to migrate`
- Reads "Subtasks to transfer" field with stored subtask IDs, and restores connection in `Tasks` relation