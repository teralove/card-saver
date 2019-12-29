'use strict';
module.exports = function CardSaver(mod) {
    const fs = require('fs');    
    function filepath() { return `${__dirname}\\saves\\${mod.game.me.name}-${mod.game.me.serverId}.json`; }
    
    let playerSaveData = [],
        gameCardData,
        deckQueuedForSwap,
        writeFileTimeout;
    
	mod.command.add(['cardsaver'], (arg) => {
        if (arg) arg = arg.toLowerCase();
        switch (arg) {
            case "on":
            case "enable":
                mod.settings.enabled = true;
                mod.command.message(`Enabled`);
                break;
            case "off":
            case "disable":
                mod.settings.enabled = false;
                mod.command.message(`Disabled`);
                break;
            case "save":
                writeFile();
                mod.command.message(`Saved`);
                break;
            case "load":
                readFile();
                mod.command.message(`Loaded`);
                break;
            case "remove":
            case "delete":
                playerSaveData = playerSaveData.filter(z => z.zone != mod.game.me.zone)    
                writeFile();
                mod.command.message(`Removed card set for current zone`);
                break;
            default:
                mod.settings.enabled = !mod.settings.enabled;
                mod.command.message(mod.settings.enabled ? `Enabled` : `Disabled`);
                break;                
        }
	});
        
    mod.game.on('enter_game', () => {
        playerSaveData = [],
        gameCardData = undefined,
        deckQueuedForSwap = undefined;
        writeFileTimeout = undefined;
        
        readFile();
    });
    
    mod.game.me.on('change_zone', (zone, quick) => {    
        if (!mod.settings.enabled || !gameCardData) return;

        if (mod.game.me.inOpenWorld && mod.settings.inOpenWorld ||
            mod.game.me.inDungeon && mod.settings.inDungeon ||
            mod.game.me.inBattleground && mod.settings.inBattleground ||
            mod.game.me.inCivilUnrest && mod.settings.inCivilUnrest)
        {
            let zoneData = playerSaveData.find(p => p.zone === zone);        
            if (zoneData) {
                if (!IsEquippedDeckEqualTo(zoneData)) {
                    deckQueuedForSwap = zoneData;
                }
            }
        }
    });
    
    mod.game.on('leave_loading_screen', () => {
        if (deckQueuedForSwap) {
            for (let card of gameCardData.presets[gameCardData.activePresetId].cards) {
                mod.send('C_UNMOUNT_CARD', 1, {
                    preset: gameCardData.activePresetId,
                    id: card.id
                });
            }

            for (let card of deckQueuedForSwap.cards) {
                mod.send('C_MOUNT_CARD', 1, {
                    preset: gameCardData.activePresetId,
                    id: card.id
                });
            }
            deckQueuedForSwap = undefined;
        }
    });
    
    mod.hook('S_CARD_DATA', 1, (event) => { 
        gameCardData = event;
//        mod.log(`\n S_CARD_DATA \n ${JSON.stringify(event)}`);
    });
    
    mod.hook('S_MOUNT_CARD', 1, (event) => {
        let oldLength = gameCardData.presets[gameCardData.activePresetId].cards.length;

        if (!gameCardData.presets[gameCardData.activePresetId].cards.find(c => c.id == event.id))        
            gameCardData.presets[gameCardData.activePresetId].cards.push({id: event.id});

        if (oldLength != gameCardData.presets[gameCardData.activePresetId].cards.length)
            updatePlayerSaveDataWithCurrentZone();
    });    
    
    mod.hook('S_UNMOUNT_CARD', 1, (event) => { 
        let oldLength = gameCardData.presets[gameCardData.activePresetId].cards.length;

        gameCardData.presets[gameCardData.activePresetId].cards = gameCardData.presets[gameCardData.activePresetId].cards.filter(c => c.id != event.id)    

        if (oldLength != gameCardData.presets[gameCardData.activePresetId].cards.length)
            updatePlayerSaveDataWithCurrentZone();
    });

    /*Server sends packet twice*/
    mod.hook('S_CHANGE_CARD_PRESET', 1, (event) => {
        if (gameCardData.activePresetId != event.preset) {
            gameCardData.activePresetId = event.preset;
            updatePlayerSaveDataWithCurrentZone();
        }
    }); 
    
    function updatePlayerSaveDataWithCurrentZone() {
        let zoneData = playerSaveData.find(z => z.zone == mod.game.me.zone);
        if (zoneData) {
            if (gameCardData.presets[gameCardData.activePresetId].cards)
            zoneData.cards = gameCardData.presets[gameCardData.activePresetId].cards;
        } else {
            playerSaveData.push({
                zone: mod.game.me.zone,
                cards: gameCardData.presets[gameCardData.activePresetId].cards
            });
        }

        mod.clearTimeout(writeFileTimeout);
        writeFileTimeout = mod.setTimeout(()=>{   
            writeFile();
        }, 100);
    }
    
    function readFile() {
        if (!fs.existsSync(filepath())) return;
        
        fs.readFile(filepath(), (err, data) => {
            if (err) mod.log(err);
            try {
                if (data) playerSaveData = JSON.parse(data);
            } catch (e) {
                mod.log(e);
            }
        });
    }

    function writeFile() {
        playerSaveData.sort((a,b)=>{return (a.zone - b.zone)});
            
        fs.writeFile(filepath(), JSON.stringify(playerSaveData, null, 2), (err) => {
            if (err) mod.log(err);
        });
    }
    
    function IsEquippedDeckEqualTo(preset) {         
        if (preset.cards.length != gameCardData.presets[gameCardData.activePresetId].cards.length) return false;
        
        for (let card of preset.cards) {
            if (!gameCardData.presets[gameCardData.activePresetId].cards.find(c => c.id == card.id)) return false;
        }
        return true;
    }
    
}