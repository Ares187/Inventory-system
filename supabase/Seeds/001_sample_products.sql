
-- Sneaker Factory Inventory System
-- Sample product catalog for development

insert into public.products (
    gender, brand, model, version,
    size, width, color, retail_price,
    internal_sku
)
values
    ('Men', 'Brooks', 'Ghost', '17',
     '9', 'D', 'Black', 150.00, 'BR-GH17-M-9-D-BLK'),

    ('Men', 'Brooks', 'Ghost', '17',
     '10', 'D', 'Black', 150.00, 'BR-GH17-M-10-D-BLK'),

    ('Men', 'Brooks', 'Ghost', '17',
     '10', '2E', 'Black', 150.00, 'BR-GH17-M-10-2E-BLK'),

    ('Men', 'Brooks', 'Ghost', '17',
     '10', 'D', 'Blue', 150.00, 'BR-GH17-M-10-D-BLU'),

    ('Women', 'Hoka', 'Clifton', '10',
     '8', 'B', 'White', 150.00, 'HK-CL10-W-8-B-WHT'),

    ('Women', 'Hoka', 'Clifton', '10',
     '9', 'B', 'White', 150.00, 'HK-CL10-W-9-B-WHT'),

    ('Men', 'ASICS', 'Gel-Nimbus', '27',
     '11', 'D', 'Black', 165.00, 'AS-NI27-M-11-D-BLK')
on conflict (internal_sku) do nothing;
