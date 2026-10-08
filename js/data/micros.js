// Numbered micro-departments per sub-department, as printed on the label
// integrity sheet. Static for the pilot; later this comes with the map.
export const SUBS = [['h1', 'H1', 'Kitchen'], ['h2', 'H2', 'Bed, Bath, Laundry'], ['h3', 'H3', 'Decor & Pets'], ['h4', 'H4', 'Stationery'], ['c1', 'C1', 'Women’s Clothing'], ['c2', 'C2', 'Men’s Clothing'], ['c3', 'C3', 'Footwear'], ['c4', 'C4', 'Cosmetics & Accessories'], ['k1', 'K1', 'Active'], ['k2', 'K2', 'Toys'], ['k3', 'K3', 'Nursery / Party'], ['k4', 'K4', 'Kids’ Clothing'], ['flex', 'FLEX', 'Flex']];
export const MICRO = {
  h1: ['021 Seasonal Food', '023 Books', '038 Kitchen', '040 Dining', '056 Appliances'],
  h2: ['015 Laundry & Storage', '054 Furniture', '056 Appliances', '072 Bathroom', '073 Bedroom Accessories', '074 Bed Linen'],
  h3: ['046 Pet Care', '054 Furniture', '066 Home Furnishings', '069 Hardware & Electrical', '071 Home Decorator'],
  h4: ['023 Books', '024 Stationery', '050 Craft and Frames', '053 Photo Centre', '063 Str Use Stationery', '068 Magazines', '075 Family Technology', '097 Reusable Bags', '099 Gift Cards & Recharge'],
  c1: ['001 Footwear', '002 Seasonal', '003 Youth Outerwear', '004 Knit Tops', '005 Bottoms', '010 Sleepwear', '011 Briefs/Function', '012 Bras/Co-ords', '013 Hosiery/Socks', '052 Wovens', '060 Wms Leisure', '070 Curve & Maternity'],
  c2: ['009 Footwear', '090 U/Wear/Socks', '091 Knits', '092 Wovens', '093 Sleepwear', '096 Work Dept'],
  c3: ['001 Footwear', '009 Footwear', '081 Kids Footwear'],
  c4: ['020 Cosmetics', '085 Personal Care', '032 Jewellery/Watch/Sunglasses', '035 Beauty & Accessories', '036 Handbags & Accessories', '037 Accessories'],
  k1: ['027 Wheels', '048 Backpacks & Travel', '064 Active Men/Fanzone', '065 Active', '076 Camp, Fishing, Auto', '077 Sport & Recreation'],
  k2: ['022 Kids Indoor Play', '047 Action/Vehicle Toys', '067 Dolls & Construction', '087 Preschool Toys'],
  k3: ['017 Xmas Trim & Wrap', '025 Cards & Wrap', '028 Party Goods', '030 Babywear', '033 Nursery', '044 Confec & Drinks'],
  k4: ['006 Girlswear 1-9', '008 Girlswear 8-16', '016 Boyswear 8-16', '019 Schoolwear', '026 Boyswear 1-9', '034 Kids Underwear & Socks', '057 Kids Accessories', '088 Kids Sleepwear'],
  flex: ['029 Easter'],
};
// micro id as the legacy mode keys it: "<sub>-<code>", e.g. h4-024
export const microId = (sub, entry) => `${sub}-${entry.slice(0, 3)}`;
export const microCode = entry => entry.slice(0, 3);
export const microName = entry => entry.slice(4);
export const microCount = () => Object.values(MICRO).reduce((n, l) => n + l.length, 0);
