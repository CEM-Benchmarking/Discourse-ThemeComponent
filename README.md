# Discourse Theme Component
## Table of Contents

1. [Description](#description)
2. [Initial Setup](#initial-setup)
3. [Running The Project](#running-the-project)
4. [Debugging](#debugging)
5. [Deployment](#deployment)
   - [Staging](#staging)
   - [Production](#production)
6. [Additional Information](#additional-information)

## Description
This theme component customizes event-related categories on our Discourse forum (PIN) to resemble an agenda. It hides some default columns, modifies topic previews, and removes certain options within threads for a cleaner event-focused experience.

### URLs
#### Staging
* [Agenda](https://pintest.cembenchmarking.com/c/agenda/43) (See the topics styling)
* [Theme Component UI](https://pintest.cembenchmarking.com/admin/customize/components)

#### Production
* [Agenda](https://pin.cembenchmarking.com/c/pabs-conference-2025/46) (See the topics styling)
* [Theme Component UI](https://pin.cembenchmarking.com/admin/customize/components)

### Stack
- **Frontend:**
  - Ember JS
  - Handlebars JS
  - Glimmer JS
  - SCSS

## Initial Setup

1. **Open WSL** on your machine.
2. **Clone this repository** into your workspace.
3. **Install the Discourse Theme CLI**:
   - Follow the [official installation guide](https://meta.discourse.org/t/install-the-discourse-theme-cli-console-app-to-help-you-build-themes/82950).
4. **Set the API Key** (available in Bitwarden).
5. **Preview Changes**: Run the Discourse Theme CLI to see your changes in real time without affecting the live site.

> ⚠️ **Note:** Avoid using the Theme Creator, as we’ve customized existing plugins. The CLI is the preferred method.

## Running the Project

1. **Navigate to the Project Folder**:
   ```bash
   cd path/to/your/project
   ```
2. **Start the Discourse Theme CLI**:
   ```bash
   discourse themes:watch
   ```
3. **View Your Changes**:
   - Open your Discourse site in a browser.
   - Any changes you make locally will reflect in real-time without affecting the live environment.

## Deployment

1. **Push Your Changes**: Merge your changes into the `main` branch via a Pull Request.
2. **Update the Theme**:
   - Go to the **Admin Panel** of your Discourse instance.
   - Navigate to the theme section and click **Update** to apply the latest changes.
3. **No Downtime Required**: Template updates apply instantly without needing to rebuild the app.

## Debugging

- **Live Preview**: Use the Discourse Theme CLI to preview changes before deployment.
- **Check the Console**: Open your browser’s dev tools to catch JavaScript errors or inspect CSS changes.
- **Inspect API Requests**: If you’re fetching data, watch for API calls in the **Network** tab.

## Additional Information
### Theme Structure
Keep the folder structure consistent. Refer to the [Discourse Theme Structure Guide](https://meta.discourse.org/t/structure-of-themes-and-theme-components/60848) for best practices.
