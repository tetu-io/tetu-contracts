import {ISettingsParam} from "tslog";

const logSettings: ISettingsParam<undefined> = {
  stylePrettyLogs: true,
  hideLogPositionForProduction: true,
  // minLevel: 3
}

export default (logSettings);
