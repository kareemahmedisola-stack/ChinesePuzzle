/* Know your Chinese – extra questions written from the lesson text of the thinner modules (0, 1, 3, 4).
   Loaded after course.js. Each entry: [question, right answer, [3 wrong answers], explanation]. The right answer is stored first; the quiz shuffles the options. */
(function () {
  'use strict';
  var C = window.COURSE; if (!C) return;
  var X = {
    0: [
      ['In “mā”, which part is the initial?', 'm', ['a', 'ā', 'The tone mark'], 'The initial is the opening consonant: m. The final is a, and the mark gives the tone.'],
      ['Which tone is “mǎ” (horse)?', 'Third tone (dip)', ['First tone (flat)', 'Second tone (rising)', 'Fourth tone (falling)'], 'The caron (ˇ) marks the third tone: it falls, then rises.'],
      ['Which number changes from yī to yí before a fourth tone?', 'yī (one)', ['bā (eight)', 'sān (three)', 'shí (ten)'], 'Yī becomes yí before a fourth tone, as in yí gè.'],
      ['Where does the tone mark go in the syllables “iu” and “ui”?', 'On the second vowel', ['On the first vowel', 'On the initial', 'Above the whole syllable'], 'In iu and ui the mark goes on the second vowel (liú, duì).'],
      ['Which characters does mainland China use?', 'Simplified characters', ['Traditional characters', 'Pinyin only', 'Cursive only'], 'Mainland China uses simplified characters; Hong Kong, Macau and Taiwan mostly use traditional ones.'],
      ['How is the sound “ü” made?', 'Say “ee” with rounded lips', ['Say “oo” with spread lips', 'Say “ah” loudly', 'Like English “you”'], 'Say “ee” with rounded lips, as in nǚ (female).'],
      ['In the pairs b–p, d–t and g–k, which letter is said with a puff of air?', 'The second letter of each pair', ['The first letter of each pair', 'Both letters', 'Neither letter'], 'The second letter (p, t, k) carries the puff of air.'],
      ['In which year was pinyin adopted in the People’s Republic of China?', '1958', ['1949', '1976', '1992'], 'Pinyin was adopted in 1958.'],
      ['How do most people type Chinese on a phone?', 'By typing pinyin and choosing the character', ['By drawing every stroke in order', 'By typing English letters only', 'They cannot type Chinese'], 'Entering pinyin and picking the right character from a list is the usual method.'],
      ['Which word is written with a capital letter in pinyin?', 'Běijīng', ['shū', 'hǎo', 'bù'], 'Names of people and places begin with a capital letter.']
    ],
    1: [
      ['Which language is the national standard language of China?', 'Pǔtōnghuà (Standard Mandarin)', ['Cantonese', 'Shanghainese', 'Hakka'], 'Pǔtōnghuà is the national standard.'],
      ['About how large is China?', 'About 9.6 million square kilometres', ['About 1.2 million', 'About 24 million', 'About 3 million'], 'China covers about 9.6 million km².'],
      ['What is the main unit of China’s currency, the renminbi?', 'The yuan', ['The jiǎo', 'The fēn', 'The yen'], 'The main unit is the yuan (spoken kuài).'],
      ['How many jiǎo make one yuán?', 'Ten', ['Five', 'One hundred', 'Twenty'], 'One yuan is ten jiǎo, and one jiǎo is ten fēn.'],
      ['Beijing Time is how many hours ahead of Nigeria?', '7 hours', ['1 hour', '5 hours', '9 hours'], 'Beijing is UTC+8 and Nigeria is UTC+1, so 7 hours.'],
      ['Which date is China’s National Day?', '1 October', ['1 January', '1 May', '25 October'], 'The PRC was proclaimed on 1 October 1949.'],
      ['What is China’s international telephone code?', '+86', ['+81', '+234', '+44'], 'China’s telephone code is +86.'],
      ['Which is the largest of China’s officially recognised ethnic groups?', 'The Han', ['The Tibetans', 'The Uyghurs', 'The Zhuang'], 'There are 56 groups, and the Han are the largest.'],
      ['Which gate appears on China’s national emblem?', 'Tiān’ānmén', ['Gùgōng', 'Chángchéng', 'Bīngmǎyǒng'], 'The emblem shows Tiān’ānmén under five stars.'],
      ['Since when has China held the Chinese seat at the United Nations?', '25 October 1971', ['1 October 1949', '1 January 1912', '4 June 1989'], 'China has held the seat since 25 October 1971.']
    ],
    3: [
      ['Which dynasty left the first known Chinese writing, carved on bones and shells?', 'Shang', ['Han', 'Tang', 'Ming'], 'Shang writing was carved on animal bones and turtle shells.'],
      ['Who is Kǒngzǐ?', 'Confucius', ['The first emperor', 'A Tang poet', 'A Ming admiral'], 'Kǒngzǐ (孔子) is Confucius, a thinker of the Zhou period.'],
      ['Chang’an, the Tang capital, is today’s…', 'Xi’an', ['Beijing', 'Nanjing', 'Shanghai'], 'Chang’an is today’s Xi’an.'],
      ['Which dynasty built the Forbidden City in Beijing?', 'Ming', ['Qin', 'Song', 'Yuan'], 'The Ming dynasty completed the Forbidden City in 1420.'],
      ['When was the Republic of China established?', '1 January 1912', ['1 October 1949', '221 BCE', '1 January 1979'], 'The 1911 Revolution ended imperial rule; the Republic began on 1 January 1912.'],
      ['Reform and Opening Up (Gǎigé Kāifàng) began in…', 'The late 1970s', ['The 1920s', 'The 1950s', 'The 1990s'], 'The policy began in the late 1970s.'],
      ['In which year did farmers find the Terracotta Army?', '1974', ['1949', '1912', '1990'], 'It was found by farmers in 1974 near Xi’an.'],
      ['Which dynasty reunified China and started the Grand Canal?', 'Sui', ['Song', 'Zhou', 'Qing'], 'The Sui dynasty (581–618) started the Grand Canal.'],
      ['Which dynasty was Mongol rule under Kublai Khan?', 'Yuan', ['Ming', 'Qing', 'Han'], 'The Yuan dynasty (1271–1368) was Mongol rule.'],
      ['Which dynasty is known for printing and the compass?', 'Song', ['Qin', 'Sui', 'Yuan'], 'The Song dynasty (960–1279) was known for printing, the compass and city life.']
    ],
    4: [
      ['What does xiào (孝) mean?', 'Filial piety: respect for elders', ['A red envelope', 'Good fortune', 'A festival dumpling'], 'Xiào is respect for elders.'],
      ['What is “miànzi” (面子)?', 'Face: dignity and reputation', ['A noodle dish', 'A festival song', 'A lucky number'], 'Praising people in public and avoiding embarrassment protects face.'],
      ['Why is the character 福 often hung upside down at New Year?', '“Upside down” (dào) sounds like “arrive” (dào)', ['It marks bad luck', 'It is a mistake', 'It shows mourning'], 'The sound game means good fortune arrives.'],
      ['What do people eat at the Lantern Festival?', 'Sweet rice balls (tāngyuán)', ['Mooncakes', 'Zòngzi', 'Cold noodles'], 'Tāngyuán are eaten on the fifteenth day of the new year.'],
      ['What is traditionally eaten at the Dragon Boat Festival?', 'Zòngzi', ['Yuèbǐng', 'Tāngyuán', 'Jiǎozi only'], 'Zòngzi are sticky rice in leaves.'],
      ['What is traditionally eaten at the Mid-Autumn Festival?', 'Mooncakes (yuèbǐng)', ['Zòngzi', 'Tāngyuán', 'Red envelopes'], 'Mooncakes go with moon-gazing and family reunion.'],
      ['Which number is lucky because it sounds like “to prosper” (fā)?', 'Eight (bā)', ['Four (sì)', 'Seven (qī)', 'Nine (jiǔ)'], 'Eight is lucky; four sounds like “death”.'],
      ['Why should you avoid giving a clock as a gift?', '“Sòng zhōng” sounds like attending a funeral', ['It is too expensive', 'Clocks are unlucky red', 'It means “hurry up”'], 'The sound similarity makes it a poor gift.'],
      ['How many statutory public holidays does China have?', 'Seven', ['Three', 'Five', 'Twelve'], 'They are New Year’s Day, Spring Festival, Qingming, Labour Day, Dragon Boat, Mid-Autumn and National Day.'],
      ['Which festival is for tomb-sweeping and remembering ancestors?', 'Qingming', ['Qixi', 'Dragon Boat', 'Double Ninth'], 'Qingming falls about 4–5 April.']
    ]
  };
  Object.keys(X).forEach(function (id) {
    var m = C.modules[+id]; if (!m) return;
    X[id].forEach(function (r, i) {
      m.questions.push({ id: 'X' + id + '.' + (i + 1), q: r[0], o: [r[1]].concat(r[2]), a: 0, e: r[3], s: 'ext' });
    });
  });
})();
