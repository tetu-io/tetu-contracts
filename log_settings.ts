import {ISettingsParam} from "tslog";

const logSettings: ISettingsParam = {
  colorizePrettyLogs: false,
  dateTimeTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  displayLogLevel: false,
  displayLoggerName: false,
  displayFunctionName: false,
  displayFilePath: 'hidden',
}

export default (logSettings);
