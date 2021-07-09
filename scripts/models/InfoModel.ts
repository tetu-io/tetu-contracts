import {VaultInfoModel} from "./VaultInfoModel";
import {UserInfoModel} from "./UserInfoModel";

export class InfoModel {
  vault: VaultInfoModel;
  user: UserInfoModel;


  constructor(vault: VaultInfoModel, user: UserInfoModel) {
    this.vault = vault;
    this.user = user;
  }
}
