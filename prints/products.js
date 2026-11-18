/* =========================================================
   PRINTS — this list feeds the shop and the order form.

   Each { ... } block is one product.
   To add a print: copy a block, paste it after the last
   one (keep the comma), and edit the fields.
   To remove a print, delete its block.

   Fields:
     name         Name on the card and in the order menu.
     description  One or two sentences about the print.
     price        Words to show, such as "Message for price"
                  or "Price TBD".
     images       Photo paths in the prints/img/ folder.
                  One path is a single photo:
                    ["img/my-print.jpg"]
                  More than one adds thumbnails on the card.
                  Put the files in prints/img/ first.
                  A missing file shows an empty photo frame.
     alts         Optional. One description per photo, in the
                  same order as images. Used as the image alt text.
     label        Optional short tag, such as "FLIGHT-TESTED".
                  Delete this line if you don't want a tag.

   If the name or description contains "Example – replace me",
   the card shows an example badge. Delete that phrase when
   the print is real.

   The Order button opens order.html?item=<the product name>.
   ========================================================= */
const PRODUCTS = [
  {
    name: "GravityAssist Phone Stand",
    description: "A sturdy 3D-printed phone stand that holds your phone in landscape for videos, calls, or Netflix. Printed in PLA (polylactic acid), a plant-based bioplastic, with a cable pass-through hole for charging.",
    price: "Message for price",
    images: [
      "img/gravityassist-1.jpg",
      "img/gravityassist-2.jpg",
      "img/gravityassist-3.jpg",
      "img/gravityassist-4.jpg",
      "img/gravityassist-5.jpg",
      "img/gravityassist-6.jpg"
    ],
    alts: [
      "GravityAssist Phone Stand holding a phone in landscape with Netflix on the screen",
      "GravityAssist Phone Stand in side profile on a white background",
      "GravityAssist Phone Stand from the front on a couch",
      "GravityAssist Phone Stand at an angle on a couch",
      "GravityAssist Phone Stand from the side, with the cable hole visible, on a couch",
      "GravityAssist Phone Stand from the back on a couch"
    ],
    label: "FLIGHT-TESTED"
  },
  {
    name: "Mini Glider",
    description: "Example – replace me. A stand-in for a pocket-size glider, not a print you can order yet.",
    price: "Price TBD",
    images: ["img/placeholder.svg"]
  },
  {
    name: "Gear Keychain",
    description: "Example – replace me. A stand-in for a gear-shaped keychain, not a print you can order yet.",
    price: "Price TBD",
    images: ["img/placeholder.svg"]
  }
];
