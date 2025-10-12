import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import AccessRolesModule from './access/AccessRoles';
import AddressBookModule from './access/AddressBook';
import MultisigWalletModule from './access/MultisigWallet';
import PauseManagerModule from './access/PauseManager';
import TokensManagerModule from './tokens/TokensManager';
import TreasuryModule from './vaults/Treasury';
import GameManagerModule from './games/GameManager';
import DiceModule from './games/Dice';
import ReferralProgram from './vaults/ReferralProgram';

const AllModule = buildModule('AllModule', m => {
  const accessRoles = m.useModule(AccessRolesModule);
  const addressBook = m.useModule(AddressBookModule);
  const multisigWallet = m.useModule(MultisigWalletModule);
  const pauseManager = m.useModule(PauseManagerModule);
  const treasury = m.useModule(TreasuryModule);
  const referralProgram = m.useModule(ReferralProgram);
  const tokensManager = m.useModule(TokensManagerModule);
  const gameManager = m.useModule(GameManagerModule);
  const dice = m.useModule(DiceModule);

  return {
    accessRolesProxy: accessRoles.accessRolesProxy,
    accessRolesImpl: accessRoles.accessRolesImpl,
    addressBookProxy: addressBook.addressBookProxy,
    addressBookImpl: addressBook.addressBookImpl,
    multisigProxy: multisigWallet.multisigProxy,
    multisigImpl: multisigWallet.multisigImpl,
    pauseManagerProxy: pauseManager.pauseManagerProxy,
    pauseManagerImpl: pauseManager.pauseManagerImpl,
    TokensManagerProxy: tokensManager.tokensManagerProxy,
    TokensManagerImpl: tokensManager.tokensManagerImpl,
    TreasuryProxy: treasury.treasuryProxy,
    TreasuryImpl: treasury.treasuryImpl,
    ReferralProgramProxy: referralProgram.referralProgramProxy,
    ReferralProgramImpl: referralProgram.referralProgramImpl,
    gameManagerProxy: gameManager.gameManagerProxy,
    gameManagerImpl: gameManager.gameManagerImpl,
    diceProxy: dice.diceProxy,
    diceImpl: dice.diceImpl,
  };
});

export default AllModule;
