import proj4 from 'proj4';

export const projectionStates = [
    { name: 'Alabama', code: 'AL' },
    { name: 'Alaska', code: 'AK' },
    { name: 'Arizona', code: 'AZ' },
    { name: 'Arkansas', code: 'AR' },
    { name: 'California', code: 'CA' },
    { name: 'Colorado', code: 'CO' },
    { name: 'Connecticut', code: 'CT' },
    { name: 'Delaware', code: 'DE' },
    { name: 'Florida', code: 'FL' },
    { name: 'Georgia', code: 'GA' },
    { name: 'Hawaii', code: 'HI' },
    { name: 'Idaho', code: 'ID' },
    { name: 'Illinois', code: 'IL' },
    { name: 'Indiana', code: 'IN' },
    { name: 'Iowa', code: 'IA' },
    { name: 'Kansas', code: 'KS' },
    { name: 'Kentucky', code: 'KY' },
    { name: 'Louisiana', code: 'LA' },
    { name: 'Maine', code: 'ME' },
    { name: 'Maryland', code: 'MD' },
    { name: 'Massachusetts', code: 'MA' },
    { name: 'Michigan', code: 'MI' },
    { name: 'Minnesota', code: 'MN' },
    { name: 'Mississippi', code: 'MS' },
    { name: 'Missouri', code: 'MO' },
    { name: 'Montana', code: 'MT' },
    { name: 'Nebraska', code: 'NE' },
    { name: 'Nevada', code: 'NV' },
    { name: 'New Hampshire', code: 'NH' },
    { name: 'New Jersey', code: 'NJ' },
    { name: 'New Mexico', code: 'NM' },
    { name: 'New York', code: 'NY' },
    { name: 'North Carolina', code: 'NC' },
    { name: 'North Dakota', code: 'ND' },
    { name: 'Ohio', code: 'OH' },
    { name: 'Oklahoma', code: 'OK' },
    { name: 'Oregon', code: 'OR' },
    { name: 'Pennsylvania', code: 'PA' },
    { name: 'Rhode Island', code: 'RI' },
    { name: 'South Carolina', code: 'SC' },
    { name: 'South Dakota', code: 'SD' },
    { name: 'Tennessee', code: 'TN' },
    { name: 'Texas', code: 'TX' },
    { name: 'Utah', code: 'UT' },
    { name: 'Vermont', code: 'VT' },
    { name: 'Virginia', code: 'VA' },
    { name: 'Washington', code: 'WA' },
    { name: 'West Virginia', code: 'WV' },
    { name: 'Wisconsin', code: 'WI' },
    { name: 'Wyoming', code: 'WY' },
    // Territories
    { name: 'American Samoa', code: 'AS' },
    { name: 'Guam', code: 'GU' },
    { name: 'Puerto Rico & Virgin Islands', code: 'PRVI' },
];

// All zones use NAD83 with US Survey Feet. EPSG codes and proj4 definitions from epsg.io
export const projectionZones: { [key: string]: { name: string; epsg: number; proj4def: string }[] } = {
    AL: [
        { name: 'East', epsg: 26966, proj4def: '+proj=tmerc +lat_0=30.5 +lon_0=-85.83333333333333 +k=0.99996 +x_0=200000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 26967, proj4def: '+proj=tmerc +lat_0=30.5 +lon_0=-87.5 +k=0.99996 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    AK: [
        { name: 'Zone 1', epsg: 26979, proj4def: '+proj=omerc +lat_0=57 +lonc=-133.6666666666667 +alpha=-37 +k=0.9999 +x_0=3280833.3333 +y_0=3280833.3333 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 2', epsg: 26980, proj4def: '+proj=omerc +lat_0=58.5 +lonc=-142.5 +alpha=-20 +k=0.9999 +x_0=3280833.3333 +y_0=3280833.3333 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 3', epsg: 26981, proj4def: '+proj=tmerc +lat_0=54 +lon_0=-148 +k=0.9999 +x_0=1640416.6667 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 4', epsg: 26982, proj4def: '+proj=tmerc +lat_0=54 +lon_0=-154 +k=0.9999 +x_0=1640416.6667 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 5', epsg: 26983, proj4def: '+proj=tmerc +lat_0=54 +lon_0=-162 +k=0.9999 +x_0=1640416.6667 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 6', epsg: 26984, proj4def: '+proj=tmerc +lat_0=54 +lon_0=-170 +k=0.9999 +x_0=1640416.6667 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 7', epsg: 26985, proj4def: '+proj=omerc +lat_0=61.25 +lonc=178 +alpha=110 +k=0.9999 +x_0=3280833.3333 +y_0=3280833.3333 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 8', epsg: 26986, proj4def: '+proj=omerc +lat_0=64.5 +lonc=-164 +alpha=150 +k=0.9999 +x_0=3280833.3333 +y_0=3280833.3333 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 9', epsg: 26987, proj4def: '+proj=omerc +lat_0=64 +lonc=-150 +alpha=-150 +k=0.9999 +x_0=3280833.3333 +y_0=3280833.3333 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 10', epsg: 26988, proj4def: '+proj=omerc +lat_0=65 +lonc=-140.75 +alpha=152 +k=0.9999 +x_0=3280833.3333 +y_0=3280833.3333 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    AZ: [
        { name: 'East', epsg: 26968, proj4def: '+proj=tmerc +lat_0=31 +lon_0=-110.1666666666667 +k=0.9999 +x_0=213360 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Central', epsg: 26969, proj4def: '+proj=tmerc +lat_0=31 +lon_0=-111.9166666666667 +k=0.9999333333333333 +x_0=213360 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 26970, proj4def: '+proj=tmerc +lat_0=31 +lon_0=-113.75 +k=0.9999333333333333 +x_0=213360 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    AR: [
        { name: 'North', epsg: 26971, proj4def: '+proj=lcc +lat_1=34.93333333333333 +lat_2=36.26666666666667 +lat_0=34.33333333333334 +lon_0=-92 +x_0=400000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 26972, proj4def: '+proj=lcc +lat_1=33.18333333333333 +lat_2=34.61666666666667 +lat_0=32.66666666666666 +lon_0=-92 +x_0=400000 +y_0=400000 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    CA: [
        { name: 'Zone 1', epsg: 26941, proj4def: '+proj=lcc +lat_1=40 +lat_2=41.66666666666667 +lat_0=39.33333333333334 +lon_0=-122 +x_0=2000000 +y_0=500000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 2', epsg: 26942, proj4def: '+proj=lcc +lat_1=38.33333333333334 +lat_2=39.83333333333334 +lat_0=37.66666666666666 +lon_0=-122 +x_0=2000000 +y_0=500000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 3', epsg: 26943, proj4def: '+proj=lcc +lat_1=37.06666666666667 +lat_2=38.43333333333333 +lat_0=36.5 +lon_0=-120.5 +x_0=2000000 +y_0=500000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 4', epsg: 26944, proj4def: '+proj=lcc +lat_1=36 +lat_2=37.25 +lat_0=35.33333333333334 +lon_0=-119 +x_0=2000000 +y_0=500000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 5', epsg: 26945, proj4def: '+proj=lcc +lat_1=34.03333333333333 +lat_2=35.46666666666667 +lat_0=33.5 +lon_0=-118 +x_0=2000000 +y_0=500000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 6', epsg: 26946, proj4def: '+proj=lcc +lat_1=32.78333333333333 +lat_2=33.88333333333333 +lat_0=32.16666666666667 +lon_0=-116.25 +x_0=2000000 +y_0=500000 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    CO: [
        { name: 'North', epsg: 26951, proj4def: '+proj=lcc +lat_1=39.71666666666667 +lat_2=40.78333333333333 +lat_0=39.33333333333334 +lon_0=-105.5 +x_0=914401.8289 +y_0=304800.6096 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Central', epsg: 26952, proj4def: '+proj=lcc +lat_1=38.45 +lat_2=39.75 +lat_0=37.83333333333334 +lon_0=-105.5 +x_0=914401.8289 +y_0=304800.6096 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 26953, proj4def: '+proj=lcc +lat_1=37.23333333333333 +lat_2=38.36666666666667 +lat_0=36.66666666666666 +lon_0=-105.5 +x_0=914401.8289 +y_0=304800.6096 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    CT: [{ name: 'Single Zone', epsg: 26954, proj4def: '+proj=lcc +lat_1=41.2 +lat_2=41.83333333333334 +lat_0=40.83333333333334 +lon_0=-72.75 +x_0=304800.6096 +y_0=152400.3048 +datum=NAD83 +units=us-ft +no_defs' }],
    DE: [{ name: 'Single Zone', epsg: 26955, proj4def: '+proj=tmerc +lat_0=38 +lon_0=-75.41666666666667 +k=0.999995 +x_0=152400.3048 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
    FL: [
        { name: 'East', epsg: 26956, proj4def: '+proj=tmerc +lat_0=24.33333333333333 +lon_0=-81 +k=0.9999411765 +x_0=200000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 26957, proj4def: '+proj=tmerc +lat_0=24.33333333333333 +lon_0=-82 +k=0.9999411765 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'North', epsg: 26958, proj4def: '+proj=lcc +lat_1=29.58333333333333 +lat_2=30.75 +lat_0=29 +lon_0=-84.5 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    GA: [
        { name: 'East', epsg: 26959, proj4def: '+proj=tmerc +lat_0=30 +lon_0=-82.16666666666667 +k=0.9999 +x_0=200000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 26960, proj4def: '+proj=tmerc +lat_0=30 +lon_0=-84.16666666666667 +k=0.9999 +x_0=700000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    HI: [
        { name: 'Zone 1', epsg: 26991, proj4def: '+proj=tmerc +lat_0=21.16666666666667 +lon_0=-158 +k=0.9999666667 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 2', epsg: 26992, proj4def: '+proj=tmerc +lat_0=20.66666666666667 +lon_0=-157.1666666666667 +k=0.9999666667 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 3', epsg: 26993, proj4def: '+proj=tmerc +lat_0=20.16666666666667 +lon_0=-156.6666666666667 +k=0.9999666667 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 4', epsg: 26994, proj4def: '+proj=tmerc +lat_0=19.5 +lon_0=-155.5 +k=0.9999666667 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Zone 5', epsg: 26995, proj4def: '+proj=tmerc +lat_0=18.83333333333333 +lon_0=-155.5 +k=0.9999666667 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    ID: [
        { name: 'East', epsg: 26996, proj4def: '+proj=tmerc +lat_0=42 +lon_0=-112.1666666666667 +k=0.9999473684 +x_0=250000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Central', epsg: 26997, proj4def: '+proj=tmerc +lat_0=42 +lon_0=-114 +k=0.99995 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 26998, proj4def: '+proj=tmerc +lat_0=42 +lon_0=-115.75 +k=0.9999526316 +x_0=250000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    IL: [
        { name: 'East', epsg: 26973, proj4def: '+proj=tmerc +lat_0=36.66666666666666 +lon_0=-88.33333333333333 +k=0.999975 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 26974, proj4def: '+proj=tmerc +lat_0=36.66666666666666 +lon_0=-90.16666666666667 +k=0.9999411765 +x_0=700000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    IN: [
        { name: 'East', epsg: 26975, proj4def: '+proj=tmerc +lat_0=37.5 +lon_0=-85.66666666666667 +k=0.9999666667 +x_0=100000 +y_0=250000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 26976, proj4def: '+proj=tmerc +lat_0=37.5 +lon_0=-87.08333333333333 +k=0.9999666667 +x_0=500000 +y_0=250000 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    IA: [
        { name: 'North', epsg: 26977, proj4def: '+proj=lcc +lat_1=42.06666666666667 +lat_2=43.26666666666667 +lat_0=41.5 +lon_0=-93.5 +x_0=1500000 +y_0=1000000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 26978, proj4def: '+proj=lcc +lat_1=40.61666666666667 +lat_2=41.78333333333333 +lat_0=40 +lon_0=-93.5 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    KS: [
        { name: 'North', epsg: 27003, proj4def: '+proj=lcc +lat_1=38.71666666666667 +lat_2=39.78333333333333 +lat_0=38.33333333333334 +lon_0=-98.5 +x_0=400000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27004, proj4def: '+proj=lcc +lat_1=37.26666666666667 +lat_2=38.56666666666667 +lat_0=36.66666666666666 +lon_0=-98.5 +x_0=400000 +y_0=400000 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    KY: [
        { name: 'North', epsg: 27005, proj4def: '+proj=lcc +lat_1=37.96666666666667 +lat_2=38.96666666666667 +lat_0=37.5 +lon_0=-84.25 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27006, proj4def: '+proj=lcc +lat_1=36.71666666666667 +lat_2=37.81666666666667 +lat_0=36.33333333333334 +lon_0=-85.75 +x_0=500000 +y_0=500000 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    LA: [
        { name: 'North', epsg: 27007, proj4def: '+proj=lcc +lat_1=31.16666666666667 +lat_2=32.66666666666666 +lat_0=30.5 +lon_0=-92.5 +x_0=1000000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27008, proj4def: '+proj=lcc +lat_1=29.3 +lat_2=30.7 +lat_0=28.5 +lon_0=-92.5 +x_0=1000000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    ME: [
        { name: 'East', epsg: 27009, proj4def: '+proj=tmerc +lat_0=43.66666666666666 +lon_0=-68.5 +k=0.9999 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 27010, proj4def: '+proj=tmerc +lat_0=42.83333333333333 +lon_0=-70.16666666666667 +k=0.9999666667 +x_0=900000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    MD: [{ name: 'Single Zone', epsg: 27011, proj4def: '+proj=lcc +lat_1=38.3 +lat_2=39.45 +lat_0=37.66666666666666 +lon_0=-77 +x_0=400000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
    MA: [
        { name: 'Mainland', epsg: 27012, proj4def: '+proj=lcc +lat_1=41.71666666666667 +lat_2=42.68333333333333 +lat_0=41 +lon_0=-71.5 +x_0=200000 +y_0=750000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Island', epsg: 27013, proj4def: '+proj=lcc +lat_1=41.28333333333333 +lat_2=41.45 +lat_0=41 +lon_0=-70.5 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    MI: [
        { name: 'North', epsg: 27014, proj4def: '+proj=lcc +lat_1=45.7 +lat_2=47.05 +lat_0=45.16666666666666 +lon_0=-85.5 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Central', epsg: 27015, proj4def: '+proj=lcc +lat_1=44.18333333333333 +lat_2=45.46666666666667 +lat_0=43.66666666666666 +lon_0=-84.33333333333333 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27016, proj4def: '+proj=lcc +lat_1=42.43333333333333 +lat_2=43.7 +lat_0=41.91666666666667 +lon_0=-84.33333333333333 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    MN: [
        { name: 'North', epsg: 27017, proj4def: '+proj=lcc +lat_1=47.05 +lat_2=48.61666666666667 +lat_0=46.5 +lon_0=-93.1 +x_0=800000 +y_0=100000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Central', epsg: 27018, proj4def: '+proj=lcc +lat_1=45.58333333333333 +lat_2=47.08333333333333 +lat_0=45 +lon_0=-94.25 +x_0=800000 +y_0=100000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27019, proj4def: '+proj=lcc +lat_1=43.78333333333333 +lat_2=45.21666666666667 +lat_0=43.16666666666666 +lon_0=-94 +x_0=800000 +y_0=100000 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    MS: [
        { name: 'East', epsg: 27020, proj4def: '+proj=tmerc +lat_0=30 +lon_0=-88.83333333333333 +k=0.99995 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 27021, proj4def: '+proj=tmerc +lat_0=30 +lon_0=-90.33333333333333 +k=0.9999583333 +x_0=700000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    MO: [
        { name: 'East', epsg: 27022, proj4def: '+proj=tmerc +lat_0=35.83333333333334 +lon_0=-90.5 +k=0.9999333333 +x_0=250000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Central', epsg: 27023, proj4def: '+proj=tmerc +lat_0=35.83333333333334 +lon_0=-92.5 +k=0.9999333333 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 27024, proj4def: '+proj=tmerc +lat_0=35.83333333333334 +lon_0=-94.5 +k=0.9999411765 +x_0=850000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    MT: [{ name: 'Single Zone', epsg: 27025, proj4def: '+proj=lcc +lat_1=46.36666666666667 +lat_2=48.63333333333333 +lat_0=45 +lon_0=-109.5 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
    NE: [{ name: 'Single Zone', epsg: 27026, proj4def: '+proj=lcc +lat_1=40.23333333333333 +lat_2=42.76666666666667 +lat_0=39.83333333333334 +lon_0=-100 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
    NV: [
        { name: 'East', epsg: 27027, proj4def: '+proj=tmerc +lat_0=34.75 +lon_0=-115.6666666666667 +k=0.9999 +x_0=200000 +y_0=8000000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Central', epsg: 27028, proj4def: '+proj=tmerc +lat_0=34.75 +lon_0=-116.6666666666667 +k=0.9999 +x_0=500000 +y_0=2000000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 27029, proj4def: '+proj=tmerc +lat_0=34.75 +lon_0=-118.6666666666667 +k=0.9999 +x_0=800000 +y_0=5000000 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    NH: [{ name: 'Single Zone', epsg: 27030, proj4def: '+proj=tmerc +lat_0=42.5 +lon_0=-71.66666666666667 +k=0.9999666667 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
    NJ: [{ name: 'Single Zone', epsg: 27031, proj4def: '+proj=tmerc +lat_0=38.83333333333334 +lon_0=-74.5 +k=0.9999 +x_0=150000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
    NM: [
        { name: 'East', epsg: 27032, proj4def: '+proj=tmerc +lat_0=31 +lon_0=-104.3333333333333 +k=0.9999 +x_0=165000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Central', epsg: 27033, proj4def: '+proj=tmerc +lat_0=31 +lon_0=-106.25 +k=0.9999 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 27034, proj4def: '+proj=tmerc +lat_0=31 +lon_0=-107.8333333333333 +k=0.9999 +x_0=835000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    NY: [
        { name: 'East', epsg: 27035, proj4def: '+proj=tmerc +lat_0=40 +lon_0=-74.33333333333333 +k=0.9999 +x_0=150000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Central', epsg: 27036, proj4def: '+proj=tmerc +lat_0=40 +lon_0=-76.58333333333333 +k=0.9999375 +x_0=250000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 27037, proj4def: '+proj=tmerc +lat_0=40 +lon_0=-78.58333333333333 +k=0.9999375 +x_0=250000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Long Island', epsg: 27038, proj4def: '+proj=lcc +lat_1=41.03333333333333 +lat_2=40.66666666666666 +lat_0=40.16666666666666 +lon_0=-74 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    NC: [{ name: 'Single Zone', epsg: 27039, proj4def: '+proj=lcc +lat_1=34.33333333333334 +lat_2=36.16666666666666 +lat_0=33.75 +lon_0=-79 +x_0=609601.2192 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
    ND: [
        { name: 'North', epsg: 27040, proj4def: '+proj=lcc +lat_1=47.45 +lat_2=48.71666666666667 +lat_0=47 +lon_0=-100.5 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27041, proj4def: '+proj=lcc +lat_1=46.18333333333333 +lat_2=47.26666666666667 +lat_0=45.66666666666666 +lon_0=-100.5 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    OH: [
        { name: 'North', epsg: 27042, proj4def: '+proj=lcc +lat_1=40.43333333333333 +lat_2=41.7 +lat_0=39.66666666666666 +lon_0=-82.5 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27043, proj4def: '+proj=lcc +lat_1=38.73333333333333 +lat_2=40.03333333333333 +lat_0=38 +lon_0=-82.5 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    OK: [
        { name: 'North', epsg: 27044, proj4def: '+proj=lcc +lat_1=35.56666666666667 +lat_2=36.76666666666667 +lat_0=35 +lon_0=-98 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27045, proj4def: '+proj=lcc +lat_1=33.9 +lat_2=35.16666666666667 +lat_0=33.33333333333334 +lon_0=-98 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    OR: [
        { name: 'North', epsg: 27046, proj4def: '+proj=lcc +lat_1=44.33333333333334 +lat_2=46 +lat_0=43.66666666666666 +lon_0=-120.5 +x_0=2500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27047, proj4def: '+proj=lcc +lat_1=42.33333333333334 +lat_2=44 +lat_0=41.66666666666667 +lon_0=-120.5 +x_0=1500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    PA: [
        { name: 'North', epsg: 27048, proj4def: '+proj=lcc +lat_1=40.88333333333333 +lat_2=41.95 +lat_0=40.16666666666666 +lon_0=-77.75 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27049, proj4def: '+proj=lcc +lat_1=39.93333333333333 +lat_2=40.96666666666667 +lat_0=39.33333333333334 +lon_0=-77.75 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    RI: [{ name: 'Single Zone', epsg: 27050, proj4def: '+proj=tmerc +lat_0=41.08333333333334 +lon_0=-71.5 +k=0.99999375 +x_0=100000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
    SC: [{ name: 'Single Zone', epsg: 27051, proj4def: '+proj=lcc +lat_1=32.5 +lat_2=34.83333333333334 +lat_0=31.83333333333333 +lon_0=-81 +x_0=609601.2192 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
    SD: [
        { name: 'North', epsg: 27052, proj4def: '+proj=lcc +lat_1=44.45 +lat_2=45.71666666666667 +lat_0=43.83333333333333 +lon_0=-100 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27053, proj4def: '+proj=lcc +lat_1=42.83333333333333 +lat_2=44.16666666666667 +lat_0=42.33333333333334 +lon_0=-100.25 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    TN: [{ name: 'Single Zone', epsg: 27054, proj4def: '+proj=lcc +lat_1=35.25 +lat_2=36.41666666666666 +lat_0=34.33333333333334 +lon_0=-86 +x_0=600000 +y_0=100000 +datum=NAD83 +units=us-ft +no_defs' }],
    TX: [
        { name: 'North', epsg: 27055, proj4def: '+proj=lcc +lat_1=34.65 +lat_2=36.18333333333333 +lat_0=34 +lon_0=-101.5 +x_0=200000 +y_0=1000000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'North Central', epsg: 27056, proj4def: '+proj=lcc +lat_1=32.13333333333333 +lat_2=33.96666666666667 +lat_0=31.66666666666667 +lon_0=-98.5 +x_0=600000 +y_0=2000000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Central', epsg: 27057, proj4def: '+proj=lcc +lat_1=30.11666666666667 +lat_2=31.88333333333333 +lat_0=29.66666666666667 +lon_0=-100.3333333333333 +x_0=300000 +y_0=3000000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South Central', epsg: 27058, proj4def: '+proj=lcc +lat_1=28.38333333333333 +lat_2=30.28333333333333 +lat_0=27.83333333333333 +lon_0=-99 +x_0=600000 +y_0=4000000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27059, proj4def: '+proj=lcc +lat_1=26.16666666666667 +lat_2=27.83333333333333 +lat_0=25.66666666666667 +lon_0=-98.5 +x_0=300000 +y_0=5000000 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    UT: [
        { name: 'North', epsg: 27060, proj4def: '+proj=lcc +lat_1=40.65 +lat_2=41.78333333333333 +lat_0=40.25 +lon_0=-111.5 +x_0=500000 +y_0=1000000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Central', epsg: 27061, proj4def: '+proj=lcc +lat_1=39.01666666666667 +lat_2=40.38333333333333 +lat_0=38.33333333333334 +lon_0=-111.5 +x_0=500000 +y_0=2000000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27062, proj4def: '+proj=lcc +lat_1=37.21666666666667 +lat_2=38.35 +lat_0=36.66666666666666 +lon_0=-111.5 +x_0=500000 +y_0=3000000 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    VT: [{ name: 'Single Zone', epsg: 27063, proj4def: '+proj=tmerc +lat_0=42.5 +lon_0=-72.5 +k=0.9999642857 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
    VA: [
        { name: 'North', epsg: 27064, proj4def: '+proj=lcc +lat_1=38.03333333333333 +lat_2=39.2 +lat_0=37.5 +lon_0=-78.5 +x_0=3500000 +y_0=2000000 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27065, proj4def: '+proj=lcc +lat_1=36.76666666666667 +lat_2=37.96666666666667 +lat_0=36.33333333333334 +lon_0=-78.5 +x_0=3500000 +y_0=1000000 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    WA: [
        { name: 'North', epsg: 27066, proj4def: '+proj=lcc +lat_1=47.5 +lat_2=48.73333333333333 +lat_0=47 +lon_0=-120.8333333333333 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27067, proj4def: '+proj=lcc +lat_1=45.83333333333333 +lat_2=47.33333333333333 +lat_0=45.33333333333334 +lon_0=-120.5 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    WV: [
        { name: 'North', epsg: 27068, proj4def: '+proj=lcc +lat_1=38.7 +lat_2=40.25 +lat_0=38 +lon_0=-80.5 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27069, proj4def: '+proj=lcc +lat_1=37.45 +lat_2=38.88333333333333 +lat_0=37 +lon_0=-81 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    WI: [
        { name: 'North', epsg: 27070, proj4def: '+proj=lcc +lat_1=45.55 +lat_2=46.75 +lat_0=44.91666666666667 +lon_0=-90 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'Central', epsg: 27071, proj4def: '+proj=lcc +lat_1=44.25 +lat_2=45.5 +lat_0=43.66666666666666 +lon_0=-90 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'South', epsg: 27072, proj4def: '+proj=lcc +lat_1=42.73333333333333 +lat_2=44.06666666666667 +lat_0=42.16666666666666 +lon_0=-90 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    WY: [
        { name: 'East', epsg: 27073, proj4def: '+proj=tmerc +lat_0=40.5 +lon_0=-105.1666666666667 +k=0.9999375 +x_0=200000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'East Central', epsg: 27074, proj4def: '+proj=tmerc +lat_0=40.5 +lon_0=-107.5 +k=0.9999583333 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West Central', epsg: 27075, proj4def: '+proj=tmerc +lat_0=40.5 +lon_0=-108.75 +k=0.99995 +x_0=400000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
        { name: 'West', epsg: 27076, proj4def: '+proj=tmerc +lat_0=40.5 +lon_0=-110.1666666666667 +k=0.9999411765 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' },
    ],
    // Territories
    AS: [{ name: 'Single Zone', epsg: 27077, proj4def: '+proj=lcc +lat_1=-14.2 +lat_2=-14.36666666666667 +lat_0=-14.16666666666667 +lon_0=-170.6666666666667 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
    GU: [{ name: 'Single Zone', epsg: 27078, proj4def: '+proj=tmerc +lat_0=13.5 +lon_0=144.75 +k=0.99995 +x_0=50000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
    PRVI: [{ name: 'Single Zone', epsg: 27081, proj4def: '+proj=lcc +lat_1=18.03333333333333 +lat_2=18.43333333333333 +lat_0=17.83333333333333 +lon_0=-66.43333333333334 +x_0=200000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs' }],
};

let initialized = false;
export const initProjections = () => {
    if (initialized) return;

    // Define WGS84 as a base
    proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
    // Define Web Mercator for WMS compatibility
    proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs');

    // Define all State Plane zones
    Object.values(projectionZones).forEach(zoneList => {
        zoneList.forEach(zone => {
            proj4.defs(`EPSG:${zone.epsg}`, zone.proj4def);
        });
    });

    // Real-world EPSG aliases — the zone table above uses internal ids, but
    // public ArcGIS services report authoritative wkids (e.g. Chester County
    // parcels are wkid 102729 / latestWkid 2272). Registering the real codes
    // lets esriRestClient reproject service-native geometry into the project
    // CRS instead of silently keeping native coordinates. Canonical defs from
    // the EPSG registry (NAD83 State Plane, US survey feet).
    const realEpsgDefs: Record<number, string> = {
        // Pennsylvania North / South (ftUS)
        2271: '+proj=lcc +lat_1=41.95 +lat_2=40.88333333333333 +lat_0=40.16666666666666 +lon_0=-77.75 +x_0=600000.0001016 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs',
        2272: '+proj=lcc +lat_1=40.96666666666667 +lat_2=39.93333333333333 +lat_0=39.33333333333334 +lon_0=-77.75 +x_0=600000.0001016001 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs',
        // New Jersey (ftUS)
        3424: '+proj=tmerc +lat_0=38.83333333333334 +lon_0=-74.5 +k=0.9999 +x_0=150000.0000000001 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs',
        // Maryland (ftUS)
        2248: '+proj=lcc +lat_1=39.45 +lat_2=38.3 +lat_0=37.66666666666666 +lon_0=-77 +x_0=399999.9998983998 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs',
        // Delaware (ftUS)
        2235: '+proj=tmerc +lat_0=38 +lon_0=-75.41666666666667 +k=0.999995 +x_0=200000.0000101599 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs',
        // New York East / West / Central / Long Island (ftUS)
        2260: '+proj=tmerc +lat_0=38.83333333333334 +lon_0=-74.5 +k=0.9999 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs',
        2263: '+proj=lcc +lat_1=41.03333333333333 +lat_2=40.66666666666666 +lat_0=40.16666666666666 +lon_0=-74 +x_0=300000.0000000001 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs',
    };
    Object.entries(realEpsgDefs).forEach(([code, def]) => {
        proj4.defs(`EPSG:${code}`, def);
    });

    // The internal 27xxx codes are valid NAD83(HARN) EPSG codes. Because every
    // zone here uses NAD83 with US survey feet, a zone's proj4 def is
    // numerically identical under its NAD83 (original) code — HARN shifted the
    // datum tag, not the parameters proj4 uses. Register the common NAD83
    // codes as aliases of the existing definitions so sessions that hold a
    // 22xx/28xx code (e.g. from an external ArcGIS service or an older saved
    // session) still project correctly instead of silently dropping geometry.
    const defsByEpsg = new Map<number, string>();
    Object.values(projectionZones).forEach(zoneList => {
        zoneList.forEach(zone => defsByEpsg.set(zone.epsg, zone.proj4def));
    });
    const HARN_TO_NAD83: [number, number][] = [
        [27031, 2235], // DE
        [27034, 3424], // NJ
        [27040, 2260], [27041, 2261], [27042, 2262], // NY East/Central/West
        [27043, 2248], // MD (27043 is MD; NY Long Island 2263 has its own def below)
        [27091, 2271], [27092, 2272], // PA
        [27055, 2275], [27056, 2276], [27057, 2277], [27058, 2278], [27059, 2279], // TX
    ];
    for (const [harn, nad83] of HARN_TO_NAD83) {
        const def = defsByEpsg.get(harn);
        if (def) proj4.defs(`EPSG:${nad83}`, def);
    }

    initialized = true;
};