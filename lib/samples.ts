/**
 * Example headers for the "try a sample" buttons. The addresses are real
 * networks, so the lookups show real results; the people and domains are
 * made up.
 */

export const SUSPICIOUS_SAMPLE = `Delivered-To: jordan@example.com
Received: by 2002:a05:7208:3c4a:b0:9a:1c2e:7f01 with SMTP id k10csp2184532rbd;
        Tue, 13 Oct 2026 07:42:21 -0700 (PDT)
Authentication-Results: mx.google.com;
       spf=softfail (google.com: domain of transitioning billing@paypa1-secure.com does not designate 159.89.100.10 as permitted sender) smtp.mailfrom=billing@paypa1-secure.com;
       dkim=none;
       dmarc=fail (p=NONE sp=NONE dis=NONE) header.from=paypa1-secure.com
Received: from mail.paypa1-secure.com (mail.paypa1-secure.com. [159.89.100.10])
        by mx.google.com with ESMTPS id d75a77b69052e-4a1b2c3d4e5si1234567cf.311.2026.10.13.07.42.20
        for <jordan@example.com>
        (version=TLS1_3 cipher=TLS_AES_256_GCM_SHA384 bits=256/256);
        Tue, 13 Oct 2026 07:42:20 -0700 (PDT)
Received: from [192.168.1.23] (c-73-162-45-10.hsd1.ca.comcast.net [73.162.45.10])
        by mail.paypa1-secure.com (Postfix) with ESMTPSA id 4F2A81C0123
        for <jordan@example.com>; Tue, 13 Oct 2026 14:42:15 +0000 (UTC)
Return-Path: <billing@paypa1-secure.com>
From: "service@paypal.com" <billing@paypa1-secure.com>
Reply-To: PayPal Resolution <resolution-center@account-review.help>
To: jordan@example.com
Subject: Your account access has been limited
Date: Tue, 13 Oct 2026 14:42:14 +0000
Message-ID: <20261013144214.4F2A81C0123@mail.paypa1-secure.com>
X-Mailer: PHPMailer 6.9.1 (https://github.com/PHPMailer/PHPMailer)
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8`;

export const NORMAL_SAMPLE = `Delivered-To: jordan@example.com
Received: by 2002:a05:7208:3c4a:b0:9a:1c2e:7f01 with SMTP id k10csp2190011rbd;
        Tue, 13 Oct 2026 09:15:04 -0700 (PDT)
X-Received: by 2002:a17:90b:4a8c:b0:2e2:9a4c:1d03 with SMTP id lp12mr98765pjb.4.1792080903882;
        Tue, 13 Oct 2026 09:15:03 -0700 (PDT)
Authentication-Results: mx.google.com;
       dkim=pass header.i=@gmail.com header.s=20230601 header.b=Qm3k9x2a;
       spf=pass (google.com: domain of sam.rivera@gmail.com designates 209.85.220.41 as permitted sender) smtp.mailfrom=sam.rivera@gmail.com;
       dmarc=pass (p=NONE sp=QUARANTINE dis=NONE) header.from=gmail.com
Received: from mail-sor-f41.google.com (mail-sor-f41.google.com. [209.85.220.41])
        by mx.google.com with SMTPS id 98e67ed59e1d1-2e2a1b2c3d4sor1234567a91.7.2026.10.13.09.15.03
        for <jordan@example.com>
        (Google Transport Security);
        Tue, 13 Oct 2026 09:15:03 -0700 (PDT)
Return-Path: <sam.rivera@gmail.com>
From: Sam Rivera <sam.rivera@gmail.com>
To: Jordan Lee <jordan@example.com>
Subject: Notes from Thursday
Date: Tue, 13 Oct 2026 18:14:51 +0200
Message-ID: <CAH3x7kN2bQ9m+Lp0aB1cD2eF3gH4iJ5kL6mN7oP8qR9s@mail.gmail.com>
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="000000000000a1b2c3d4e5f6"`;
