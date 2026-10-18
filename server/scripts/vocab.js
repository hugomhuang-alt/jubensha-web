'use strict';
// 剧本可以使用的“词汇表”：场景图、人物外观、图标。剧本写错词会被 tools/validate-script.js 查出来。
module.exports = {
  scenes: ['cover', 'dining', 'study', 'library', 'kitchen', 'hall', 'clinic', 'guestroom',
    'coverShip', 'deck', 'cabin', 'engine', 'coverTheater', 'stage', 'backstage', 'cellar',
    'coverStation', 'lab', 'mourning', 'coverOldHouse', 'garden', 'coverRestaurant', 'coverLibrary', 'coverWedding', 'coverAntique', 'coverBlackout', 'coverHospital', 'coverAuction', 'coverGramophone', 'coverTwins', 'coverHomestay', 'cv_teahouse', 'cv_bookclub', 'cv_campus', 'cv_lighthouse', 'cv_vineyard', 'cv_railway', 'cv_filmset', 'cv_museum', 'cv_onsen', 'cv_greenhouse', 'cv_casino', 'cv_observatory', 'cv_bank', 'cv_clanhall', 'cv_deepstation', 'cv_birthday', 'cv_reunion', 'cv_camping', 'cv_yacht', 'cv_circus', 'cv_castle', 'cv_tvshow', 'cv_watertown', 'cv_skiresort', 'cv_colliery', 'cv_oldtrain', 'cv_princepalace', 'cv_biolab', 'cv_island', 'cv_hotel1937'],
  tones: ['none', 'cold', 'warm', 'green', 'purple', 'red', 'sepia'],
  icons: ['key', 'glass', 'door', 'pill', 'cam', 'skull', 'siren', 'clock', 'phone', 'wave', 'fire', 'mask', 'book', 'anchor', 'snow'],
  look: {
    skin: ['fair', 'light', 'tan', 'brown', 'deep'],
    hair: ['short', 'slick', 'bob', 'long', 'bun', 'bald', 'messy', 'ponytail', 'curly', 'cap', 'sidepart'],
    hairColor: ['black', 'brown', 'auburn', 'grey', 'white', 'blonde', 'red', 'silver'],
    glasses: ['none', 'round', 'rect', 'sun'],
    beard: ['none', 'stubble', 'mustache', 'goatee', 'full'],
    outfit: ['suit', 'dress', 'coat', 'uniform', 'apron', 'robe', 'shirt', 'turtleneck', 'hoodie', 'qipao', 'labcoat', 'vest', 'jacket', 'parka'],
    acc: ['tie', 'bow', 'scarf', 'necklace', 'earrings', 'badge', 'stethoscope', 'pocketwatch', 'flower', 'headset'],
    mood: ['neutral', 'smirk', 'worried', 'stern', 'sad', 'smile', 'tired', 'sly']
  }
};
