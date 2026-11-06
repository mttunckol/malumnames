'use strict';

/**
 * MALUM MECRA — İsim havuzu
 * 200 isim · 6 kategori
 * Futbol, basketbol, tenis, Formula 1, atletizm ve sansasyon yaratan diğer sporcular.
 */
const NAME_POOL = {
  futbol: [
    // Dünya futbolu
    'Messi', 'Cristiano Ronaldo', 'Neymar', 'Kylian Mbappé', 'Erling Haaland',
    'Diego Maradona', 'Pelé', 'Zinedine Zidane', 'Ronaldinho', 'Johan Cruyff',
    'Franz Beckenbauer', 'Michel Platini', 'Ronaldo Nazário', 'Romário', 'Rivaldo',
    'Kaká', 'Didier Drogba', "Samuel Eto'o", 'Thierry Henry', 'David Beckham',
    'Zlatan Ibrahimović', 'Luka Modrić', 'Xavi', 'Andrés Iniesta', 'Sergio Ramos',
    'Iker Casillas', 'Gianluigi Buffon', 'Manuel Neuer', 'Paolo Maldini',
    'Francesco Totti', 'Andrea Pirlo', 'Steven Gerrard', 'Frank Lampard',
    'Wayne Rooney', 'Eric Cantona', 'Luis Suárez', 'Sergio Agüero',
    'Mohamed Salah', 'Robert Lewandowski', 'Karim Benzema', 'Gareth Bale',
    'Kevin De Bruyne', 'Lamine Yamal', 'Jude Bellingham', 'Vinícius Júnior',
    // Türkiye futbolu
    'Metin Oktay', 'Lefter Küçükandonyadis', 'Rüştü Reçber', 'Burak Yılmaz',
    'Arda Turan', 'Emre Belözoğlu', 'Tuncay Şanlı', 'Fatih Terim', 'Şenol Güneş',
    'Mustafa Denizli', 'Mircea Lucescu', 'Gheorghe Hagi', 'Gheorghe Popescu',
    'Alex de Souza', 'Roberto Carlos', 'Cláudio Taffarel', 'Mário Jardel',
    'Fernando Muslera', 'Mauro Icardi', 'Edin Džeko', 'Dušan Tadić',
    'Arda Güler', 'Hakan Çalhanoğlu', 'Kenan Yıldız', 'Kerem Aktürkoğlu'
  ],

  basketbol: [
    'Michael Jordan', 'LeBron James', 'Kobe Bryant', "Shaquille O'Neal",
    'Kareem Abdul-Jabbar', 'Magic Johnson', 'Larry Bird', 'Wilt Chamberlain',
    'Bill Russell', 'Tim Duncan', 'Kevin Durant', 'Stephen Curry',
    'Giannis Antetokounmpo', 'Luka Dončić', 'Nikola Jokić', 'Dirk Nowitzki',
    'Dwyane Wade', 'Allen Iverson', 'Kevin Garnett', 'Charles Barkley',
    'Karl Malone', 'John Stockton', 'Scottie Pippen', 'Dennis Rodman',
    'Reggie Miller', 'Ray Allen', 'Paul Pierce', 'Kawhi Leonard', 'James Harden',
    'Russell Westbrook', 'Chris Paul', 'Carmelo Anthony', 'Yao Ming', 'Pau Gasol',
    'Manu Ginóbili', 'Tony Parker', 'Dražen Petrović', 'Hedo Türkoğlu',
    'Mehmet Okur', 'Alperen Şengün', 'Caitlin Clark', 'Victor Wembanyama'
  ],

  tenis: [
    'Roger Federer', 'Rafael Nadal', 'Novak Djokovic', 'Andy Murray',
    'Pete Sampras', 'Andre Agassi', 'John McEnroe', 'Björn Borg', 'Boris Becker',
    'Stefan Edberg', 'Ivan Lendl', 'Jimmy Connors', 'Rod Laver',
    'Martina Navratilova', 'Steffi Graf', 'Serena Williams', 'Venus Williams',
    'Maria Sharapova', 'Monica Seles', 'Martina Hingis', 'Kim Clijsters',
    'Justine Henin', 'Iga Świątek', 'Aryna Sabalenka', 'Naomi Osaka',
    'Coco Gauff', 'Anna Kournikova', 'Carlos Alcaraz', 'Jannik Sinner',
    'Nick Kyrgios'
  ],

  f1: [
    'Michael Schumacher', 'Ayrton Senna', 'Alain Prost', 'Niki Lauda',
    'Juan Manuel Fangio', 'Nigel Mansell', 'Damon Hill', 'Jacques Villeneuve',
    'Mika Häkkinen', 'Fernando Alonso', 'Lewis Hamilton', 'Sebastian Vettel',
    'Max Verstappen', 'Kimi Räikkönen', 'Jenson Button', 'Nico Rosberg',
    'Felipe Massa', 'Rubens Barrichello', 'Charles Leclerc', 'Lando Norris',
    'Oscar Piastri', 'Sergio Pérez', 'Daniel Ricciardo', 'Bernie Ecclestone',
    'Günther Steiner'
  ],

  atletizm: [
    'Usain Bolt', 'Carl Lewis', 'Jesse Owens', 'Michael Johnson', 'Mo Farah',
    'Haile Gebrselassie', 'Kenenisa Bekele', 'Eliud Kipchoge', 'Paula Radcliffe',
    'Florence Griffith-Joyner', 'Marion Jones', 'Ben Johnson', 'David Rudisha',
    'Sergey Bubka', 'Bob Beamon', 'Noah Lyles', 'Jackie Joyner-Kersee',
    'Allyson Felix', 'Shelly-Ann Fraser-Pryce', "Sha'Carri Richardson"
  ],

  diger: [
    'Muhammad Ali', 'Mike Tyson', 'Floyd Mayweather', 'Tiger Woods',
    'Lance Armstrong', 'Marco Pantani', 'Eddy Merckx', 'Michael Phelps',
    'Simone Biles', 'Nadia Comăneci', 'Tonya Harding', 'Eric Moussambani',
    'Eddie the Eagle'
  ]
};

const CATEGORY_LABELS = {
  futbol: 'FUTBOL',
  basketbol: 'BASKETBOL',
  tenis: 'TENİS',
  f1: 'FORMULA 1',
  atletizm: 'ATLETİZM',
  diger: 'DİĞER SPORLAR'
};

/** Düz liste: { name, cat } */
const ALL_NAMES = Object.entries(NAME_POOL).flatMap(([cat, names]) =>
  names.map((name) => ({ name, cat }))
);

if (ALL_NAMES.length !== 200) {
  console.warn(`[Malum Mecra] İsim havuzu 200 olmalı, şu an ${ALL_NAMES.length}.`);
}
